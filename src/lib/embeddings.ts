import path from 'node:path';

/**
 * Text -> vector.
 *  - local (default): sentence-transformers/all-MiniLM-L6-v2 (ONNX, int8) run inside Node
 *    with transformers.js. 384 dimensions, mean pooling, L2-normalised, so cosine
 *    similarity == dot product. The model (~23 MB) is downloaded once into .cache/models.
 *  - hash: offline fallback using signed feature hashing (no download, keyword-level only).
 */
export const EMBEDDING_DIM = 384;
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export type EmbeddingProvider = 'local' | 'hash';

export function embeddingProvider(): EmbeddingProvider {
  return process.env.EMBEDDING_PROVIDER === 'hash' ? 'hash' : 'local';
}

type Extractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

declare global {
  // eslint-disable-next-line no-var
  var __pesuExtractor: Promise<Extractor> | undefined;
}

function loadExtractor(): Promise<Extractor> {
  if (!globalThis.__pesuExtractor) {
    const loading = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(process.cwd(), '.cache', 'models');
      const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' });
      return extractor as unknown as Extractor;
    })();
    // allow a retry if the first load fails (e.g. offline)
    loading.catch(() => {
      globalThis.__pesuExtractor = undefined;
    });
    globalThis.__pesuExtractor = loading;
  }
  return globalThis.__pesuExtractor;
}

export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (embeddingProvider() === 'hash') return texts.map(hashEmbedding);
  const extractor = await loadExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}

export async function embed(text: string): Promise<number[]> {
  return (await embedMany([text]))[0];
}

// ---------------------------------------------------------------------
// Offline fallback: unigrams + bigrams hashed (FNV-1a) into 384 signed buckets
// ---------------------------------------------------------------------
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashEmbedding(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9+#.]+/g) ?? [];
  const features = [...words, ...words.slice(1).map((w, i) => `${words[i]} ${w}`)];
  for (const f of features) {
    const h = fnv1a(f);
    v[h % EMBEDDING_DIM] += h & 0x80000000 ? -1 : 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
