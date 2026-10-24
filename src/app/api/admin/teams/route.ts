import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';

/** GET /api/admin/teams — every team (any status) for moderation. */
export const GET = handler(async () => {
  await requireUser('ADMIN');
  const teams = await query(
    `SELECT team_id, name, event_title, category, status, leader_name, member_count, max_members,
            pending_requests, created_at
       FROM v_team_overview
      ORDER BY CASE status WHEN 'DISBANDED' THEN 1 ELSE 0 END, created_at DESC`,
  );
  return ok({ teams });
});
