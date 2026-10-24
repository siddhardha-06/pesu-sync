import { requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { handler, ok } from '@/lib/http';

/** POST /api/admin/analytics/refresh — recompute the skill demand/supply materialized view. */
export const POST = handler(async () => {
  await requireUser('ADMIN');
  // CONCURRENTLY keeps the view readable by dashboards while it refreshes (needs the unique index)
  await query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_demand');
  const info = await queryOne('SELECT MAX(refreshed_at) AS refreshed_at, COUNT(*)::INT AS skills FROM mv_skill_demand');
  return ok(info);
});
