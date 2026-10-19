import { query, queryOne, withTransaction } from './db';

/**
 * Events currently listed on pes.edu, read from the site's public JSON API
 * (The Events Calendar: /wp-json/tribe/events/v1/events) and cached in PostgreSQL.
 * A refresh runs at most every 30 minutes; between refreshes the cached rows are served.
 */
const DEFAULT_URL = 'https://pes.edu/wp-json/tribe/events/v1/events';
const SOURCE = 'pes.edu';
const MAX_AGE_MINUTES = 30;

interface TribeEvent {
  id: number | string;
  title?: string;
  url?: string;
  excerpt?: string;
  description?: string;
  all_day?: boolean;
  utc_start_date?: string;
  utc_end_date?: string;
  start_date?: string;
  end_date?: string;
  venue?: { venue?: string } | unknown[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—' };

/** WordPress returns HTML; we store plain text only. */
export function plainText(html: string | undefined, max = 600): string {
  const text = (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function utc(value: string | undefined): string | null {
  // tribe sends "YYYY-MM-DD HH:MM:SS" in UTC for the utc_* fields
  return value ? `${value.replace(' ', 'T')}Z` : null;
}

export async function refreshCampusEvents(): Promise<{ ok: boolean; fetched: number; error?: string }> {
  const base = process.env.CAMPUS_EVENTS_URL || DEFAULT_URL;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const res = await fetch(`${base}?per_page=50&start_date=${today}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`pes.edu answered HTTP ${res.status}`);
    const data = (await res.json()) as { events?: TribeEvent[] };
    const events = Array.isArray(data.events) ? data.events : [];

    await withTransaction(async (client) => {
      for (const e of events) {
        const startsAt = utc(e.utc_start_date) ?? utc(e.start_date);
        if (!startsAt || !e.url) continue;
        const venue = !Array.isArray(e.venue) && e.venue && typeof e.venue === 'object' ? (e.venue as { venue?: string }).venue : null;
        await client.query(
          `INSERT INTO campus_events (source, source_id, title, starts_at, ends_at, all_day, venue, url, summary, fetched_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (source, source_id) DO UPDATE
              SET title = EXCLUDED.title, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
                  all_day = EXCLUDED.all_day, venue = EXCLUDED.venue, url = EXCLUDED.url,
                  summary = EXCLUDED.summary, fetched_at = NOW()`,
          [
            SOURCE,
            String(e.id),
            plainText(e.title, 255) || 'Untitled event',
            startsAt,
            utc(e.utc_end_date) ?? utc(e.end_date),
            Boolean(e.all_day),
            venue ? plainText(venue, 255) : null,
            e.url,
            plainText(e.excerpt || e.description) || null,
          ],
        );
      }
      // upcoming events that pes.edu no longer lists were cancelled or moved: drop them
      await client.query(
        `DELETE FROM campus_events
          WHERE source = $1 AND starts_at >= $2::DATE AND NOT (source_id = ANY ($3::TEXT[]))`,
        [SOURCE, today, events.map((e) => String(e.id))],
      );
      await client.query('INSERT INTO campus_event_syncs (source, fetched, ok) VALUES ($1, $2, TRUE)', [SOURCE, events.length]);
    });
    return { ok: true, fetched: events.length };
  } catch (error) {
    const message = (error as Error).name === 'TimeoutError' ? 'pes.edu did not answer in time' : (error as Error).message;
    await query('INSERT INTO campus_event_syncs (source, fetched, ok, error) VALUES ($1, 0, FALSE, $2)', [SOURCE, message.slice(0, 500)]);
    return { ok: false, fetched: 0, error: message };
  }
}

export async function getCampusEvents(options: { forceRefresh?: boolean } = {}) {
  const last = await queryOne<{ synced_at: string }>(
    `SELECT synced_at FROM campus_event_syncs
      WHERE source = $1 AND synced_at > NOW() - make_interval(mins => $2)
      ORDER BY synced_at DESC LIMIT 1`,
    [SOURCE, MAX_AGE_MINUTES],
  );
  if (options.forceRefresh || !last) await refreshCampusEvents();

  const [events, lastSync] = await Promise.all([
    query(
      `SELECT campus_event_id, title, starts_at, ends_at, all_day, venue, url, summary
         FROM campus_events
        WHERE source = $1 AND COALESCE(ends_at, starts_at) >= NOW() - INTERVAL '6 hours'
        ORDER BY starts_at
        LIMIT 12`,
      [SOURCE],
    ),
    queryOne(
      `SELECT synced_at, ok, fetched, error,
              (SELECT MAX(synced_at) FROM campus_event_syncs WHERE source = $1 AND ok) AS last_ok_at
         FROM campus_event_syncs WHERE source = $1
        ORDER BY synced_at DESC LIMIT 1`,
      [SOURCE],
    ),
  ]);
  return { source: SOURCE, events, lastSync };
}
