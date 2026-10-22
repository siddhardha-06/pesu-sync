import { requireUser } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { ApiError, handler, idParam, ok, optionalInt, optionalText, readJson } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const id = idParam((await params).id);

  const team = await queryOne<{ leader_id: number }>('SELECT * FROM v_team_overview WHERE team_id = $1', [id]);
  if (!team) throw new ApiError(404, 'Team not found');

  const members = await query<{ user_id: number }>(
    `SELECT u.user_id, u.full_name, u.email, u.srn, u.semester, tm.member_role, tm.joined_at,
            (u.pesu_verified_at IS NOT NULL) AS pesu_verified,
            COALESCE((SELECT ARRAY_AGG(s.name ORDER BY us.proficiency DESC, s.name)
                        FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
                       WHERE us.user_id = u.user_id), '{}') AS skills
       FROM team_members tm
       JOIN users u ON u.user_id = tm.user_id
      WHERE tm.team_id = $1
      ORDER BY tm.member_role, tm.joined_at`,
    [id],
  );

  const isLeader = team.leader_id === me.id;
  const isMember = members.some((m) => m.user_id === me.id);
  const isStaff = me.role === 'FACULTY' || me.role === 'ADMIN';
  const canManage = isLeader || isStaff;

  const [requests, myRequest, capstone, history] = await Promise.all([
    canManage
      ? query(
          `SELECT request_id, user_id, student_name, srn, semester, student_skills, message, match_score, created_at
             FROM v_join_request_details
            WHERE team_id = $1 AND status = 'PENDING'
            ORDER BY match_score DESC NULLS LAST, created_at`,
          [id],
        )
      : Promise.resolve([]),
    me.role === 'STUDENT'
      ? queryOne(
          `SELECT request_id, status, created_at FROM join_requests
            WHERE team_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
          [id, me.id],
        )
      : Promise.resolve(null),
    queryOne('SELECT capstone_id, title, status FROM capstone_projects WHERE team_id = $1', [id]),
    isMember || isStaff
      ? query(
          `SELECT a.log_id, a.entity, a.action, a.old_value, a.new_value, a.details, a.created_at, u.full_name AS actor_name
             FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id
            WHERE (a.entity = 'teams' OR a.entity = 'team_members') AND a.entity_id = $1
            ORDER BY a.created_at, a.log_id`,
          [id],
        )
      : Promise.resolve([]),
  ]);

  return ok({ team, members, requests, myRequest, capstone, history, viewer: { isLeader, isMember, canManage, role: me.role } });
});

// Leader (or admin) edits the listing; triggers re-check size vs members and event limits
export const PATCH = handler<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const id = idParam((await params).id);
  const body = await readJson(req);

  const updated = await withTransaction(
    async (client) => {
      const { rows } = await client.query(
        `UPDATE teams
            SET description = COALESCE($3, description),
                max_members = COALESCE($4, max_members),
                deadline    = COALESCE($5::DATE, deadline)
          WHERE team_id = $1
            AND status IN ('RECRUITING', 'FULL')
            AND (leader_id = $2 OR EXISTS (SELECT 1 FROM users WHERE user_id = $2 AND role = 'ADMIN'))
          RETURNING team_id, status, max_members`,
        [
          id,
          me.id,
          optionalText(body.description, 'Description', 3000),
          optionalInt(body.maxMembers, 'Max members'),
          typeof body.deadline === 'string' && body.deadline ? body.deadline : null,
        ],
      );
      return rows[0];
    },
    { actorId: me.id },
  );
  if (!updated) throw new ApiError(403, 'Only the leader can edit an open team');
  await syncVectorsSafe('teams', [id]);
  return ok({ team: updated });
});
