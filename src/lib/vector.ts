import { QdrantClient } from '@qdrant/js-client-rest';
import { query } from './db';
import { EMBEDDING_DIM, embed, embedMany } from './embeddings';

/**
 * Qdrant = the vector database. PostgreSQL stays the source of truth:
 * every point id IS the SQL primary key, the payload carries a few
 * filterable fields, and search hits are resolved back to SQL rows.
 */
export const COLLECTIONS = {
  profiles: 'student_profiles',
  teams: 'team_listings',
  capstones: 'capstone_pitches',
} as const;

export type CollectionKey = keyof typeof COLLECTIONS;

// Payload indexes make filtered vector search (e.g. status = RECRUITING) fast
const PAYLOAD_INDEXES: Record<CollectionKey, Array<[string, 'keyword' | 'integer']>> = {
  profiles: [
    ['department', 'keyword'],
    ['semester', 'integer'],
  ],
  teams: [
    ['status', 'keyword'],
    ['event_id', 'integer'],
    ['category', 'keyword'],
  ],
  capstones: [
    ['status', 'keyword'],
    ['domain', 'keyword'],
  ],
};

declare global {
  // eslint-disable-next-line no-var
  var __pesuQdrant: QdrantClient | undefined;
  // eslint-disable-next-line no-var
  var __pesuQdrantReady: Promise<void> | undefined;
}

export function qdrant(): QdrantClient {
  globalThis.__pesuQdrant ??= new QdrantClient({
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
    checkCompatibility: false,
  });
  return globalThis.__pesuQdrant;
}

/** Creates the three collections (384-d, cosine) and their payload indexes if missing. */
export function ensureCollections(): Promise<void> {
  if (!globalThis.__pesuQdrantReady) {
    const ready = (async () => {
      const client = qdrant();
      for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
        const name = COLLECTIONS[key];
        const { exists } = await client.collectionExists(name);
        if (exists) continue;
        await client.createCollection(name, { vectors: { size: EMBEDDING_DIM, distance: 'Cosine' } });
        for (const [field, schema] of PAYLOAD_INDEXES[key]) {
          await client.createPayloadIndex(name, { field_name: field, field_schema: schema, wait: true });
        }
      }
    })();
    ready.catch(() => {
      globalThis.__pesuQdrantReady = undefined;
    });
    globalThis.__pesuQdrantReady = ready;
  }
  return globalThis.__pesuQdrantReady;
}

export async function dropCollections(): Promise<void> {
  for (const name of Object.values(COLLECTIONS)) {
    const { exists } = await qdrant().collectionExists(name);
    if (exists) await qdrant().deleteCollection(name);
  }
  globalThis.__pesuQdrantReady = undefined;
}

// ---------------------------------------------------------------------
// SQL rows -> documents (the text that gets embedded + payload metadata)
// ---------------------------------------------------------------------
interface VectorDoc {
  id: number;
  text: string;
  payload: Record<string, unknown>;
}

async function profileDocs(ids: number[] | null): Promise<VectorDoc[]> {
  const rows = await query<{
    user_id: number;
    department: string;
    semester: number;
    bio: string | null;
    skills: string[];
    projects: string | null;
  }>(
    `SELECT u.user_id, u.department, u.semester, u.bio,
            COALESCE(ARRAY_AGG(s.name ORDER BY us.proficiency DESC) FILTER (WHERE s.name IS NOT NULL), '{}') AS skills,
            (SELECT STRING_AGG(pp.title || COALESCE(': ' || pp.description, ''), '. ')
               FROM past_projects pp WHERE pp.user_id = u.user_id) AS projects
       FROM users u
       LEFT JOIN user_skills us ON us.user_id = u.user_id
       LEFT JOIN skills s       ON s.skill_id = us.skill_id
      WHERE u.role = 'STUDENT' AND u.is_active
        AND ($1::INT[] IS NULL OR u.user_id = ANY ($1))
      GROUP BY u.user_id`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.user_id,
    text: [`Skills: ${r.skills.join(', ')}.`, r.bio ?? '', r.projects ? `Past projects: ${r.projects}.` : '']
      .filter(Boolean)
      .join(' '),
    payload: { user_id: r.user_id, department: r.department, semester: r.semester, skills: r.skills },
  }));
}

async function teamDocs(ids: number[] | null): Promise<VectorDoc[]> {
  const rows = await query<{
    team_id: number;
    name: string;
    description: string;
    category: string;
    status: string;
    event_id: number;
    event_title: string;
    event_type: string;
    required_skills: string[];
  }>(
    `SELECT team_id, name, description, category, status, event_id, event_title, event_type, required_skills
       FROM v_team_overview
      WHERE status <> 'DISBANDED'
        AND ($1::INT[] IS NULL OR team_id = ANY ($1))`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.team_id,
    text: `${r.name}. ${r.category} team for ${r.event_title} (${r.event_type}). Looking for: ${r.required_skills.join(', ')}. ${r.description}`,
    payload: { team_id: r.team_id, event_id: r.event_id, status: r.status, category: r.category },
  }));
}

async function capstoneDocs(ids: number[] | null): Promise<VectorDoc[]> {
  const rows = await query<{
    capstone_id: number;
    title: string;
    abstract: string;
    domain: string;
    tech_stack: string | null;
    status: string;
  }>(
    `SELECT capstone_id, title, abstract, domain, tech_stack, status
       FROM capstone_projects
      WHERE status <> 'DRAFT'
        AND ($1::INT[] IS NULL OR capstone_id = ANY ($1))`,
    [ids],
  );
  return rows.map((r) => ({
    id: r.capstone_id,
    text: `${r.title}. Domain: ${r.domain}. Tech stack: ${r.tech_stack ?? 'n/a'}. ${r.abstract}`,
    payload: { capstone_id: r.capstone_id, status: r.status, domain: r.domain },
  }));
}

const DOC_BUILDERS: Record<CollectionKey, (ids: number[] | null) => Promise<VectorDoc[]>> = {
  profiles: profileDocs,
  teams: teamDocs,
  capstones: capstoneDocs,
};

/**
 * (Re-)embeds the given SQL rows (or all rows when ids is omitted) and upserts them.
 * Requested ids that are no longer eligible (deactivated user, disbanded team) are deleted.
 */
export async function syncVectors(key: CollectionKey, ids?: number[]): Promise<number> {
  await ensureCollections();
  const docs = await DOC_BUILDERS[key](ids ?? null);
  const collection = COLLECTIONS[key];
  const indexedAt = new Date().toISOString();

  for (let i = 0; i < docs.length; i += 16) {
    const batch = docs.slice(i, i + 16);
    const vectors = await embedMany(batch.map((d) => d.text));
    await qdrant().upsert(collection, {
      wait: true,
      points: batch.map((d, j) => ({
        id: d.id,
        vector: vectors[j],
        payload: { ...d.payload, text: d.text, indexed_at: indexedAt },
      })),
    });
  }

  if (ids && ids.length > 0) {
    const found = new Set(docs.map((d) => d.id));
    const stale = ids.filter((id) => !found.has(id));
    if (stale.length > 0) await qdrant().delete(collection, { wait: true, points: stale });
  }
  return docs.length;
}

/** Used by API routes after a SQL write: a vector-DB hiccup must not fail the request. */
export async function syncVectorsSafe(key: CollectionKey, ids: number[]): Promise<void> {
  try {
    await syncVectors(key, ids);
  } catch (error) {
    console.warn(`[vector] could not sync ${key} ${ids.join(',')}: ${(error as Error).message}`);
  }
}

export async function getVector(key: CollectionKey, id: number): Promise<number[] | null> {
  await ensureCollections();
  const points = await qdrant().retrieve(COLLECTIONS[key], { ids: [id], with_vector: true, with_payload: false });
  const vector = points[0]?.vector;
  return Array.isArray(vector) ? (vector as number[]) : null;
}

/** Stored vector for a row; embeds it on the fly if it was never indexed (self-healing). */
export async function ensureVector(key: CollectionKey, id: number): Promise<number[] | null> {
  const existing = await getVector(key, id);
  if (existing) return existing;
  await syncVectors(key, [id]);
  return getVector(key, id);
}

export interface VectorHit {
  id: number;
  score: number;
}

type Filter = { must?: unknown[]; must_not?: unknown[] };

/** k-nearest-neighbour search (cosine) with an optional payload filter. */
export async function searchByVector(
  key: CollectionKey,
  vector: number[],
  options: { limit?: number; filter?: Filter } = {},
): Promise<VectorHit[]> {
  await ensureCollections();
  const result = await qdrant().query(COLLECTIONS[key], {
    query: vector,
    limit: options.limit ?? 10,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter: options.filter as any,
    with_payload: false,
  });
  return result.points.map((p) => ({ id: Number(p.id), score: p.score }));
}

export async function searchByText(
  key: CollectionKey,
  text: string,
  options: { limit?: number; filter?: Filter } = {},
): Promise<VectorHit[]> {
  return searchByVector(key, await embed(text), options);
}

export function matchFilter(field: string, value: string | number): Filter {
  return { must: [{ key: field, match: { value } }] };
}

export function excludeIds(ids: number[]): Filter {
  return ids.length ? { must_not: [{ has_id: ids }] } : {};
}

export async function collectionStats() {
  await ensureCollections();
  const out: Record<string, { points: number }> = {};
  for (const name of Object.values(COLLECTIONS)) {
    const info = await qdrant().getCollection(name);
    out[name] = { points: info.points_count ?? 0 };
  }
  return out;
}
