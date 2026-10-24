import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';

/** GET /api/admin/audit?entity=&action=&actor=&limit= — read-only view of the trigger-written audit trail. */
export const GET = handler(async (req) => {
  await requireUser('ADMIN', 'FACULTY');
  const p = new URL(req.url).searchParams;
  const limit = Math.min(Number(p.get('limit')) || 100, 500);
  const [logs, summary] = await Promise.all([
    query(
      `SELECT a.log_id, a.entity, a.entity_id, a.action, a.old_value, a.new_value, a.details, a.created_at,
              u.full_name AS actor_name, u.role AS actor_role
         FROM audit_logs a
         LEFT JOIN users u ON u.user_id = a.actor_id
        WHERE ($1::TEXT IS NULL OR a.entity = $1)
          AND ($2::TEXT IS NULL OR a.action = $2)
          AND ($3::TEXT IS NULL OR u.full_name ILIKE '%' || $3 || '%')
        ORDER BY a.created_at DESC, a.log_id DESC
        LIMIT $4`,
      [p.get('entity') || null, p.get('action') || null, p.get('actor')?.trim() || null, limit],
    ),
    query(
      `SELECT entity, action, COUNT(*)::INT AS total
         FROM audit_logs GROUP BY ROLLUP (entity, action)
        ORDER BY entity NULLS LAST, action NULLS LAST`,
    ),
  ]);
  return ok({ logs, summary });
});
