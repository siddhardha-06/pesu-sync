import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { ApiError, handler, idParam, ok } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string; userId: string }> };

/**
 * DELETE /api/teams/:id/members/:userId — a member leaves, or the leader/admin removes a member.
 * Triggers: leaving a LOCKED team is refused; a FULL team flips back to RECRUITING.
 */
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const p = await params;
  const teamId = idParam(p.id);
  const userId = idParam(p.userId);

  const removed = await withTransaction(
    async (client) => {
      const { rows } = await client.query(
        `DELETE FROM team_members tm
          USING teams t
          WHERE tm.team_id = $1
            AND tm.user_id = $2
            AND tm.member_role = 'MEMBER'
            AND t.team_id = tm.team_id
            AND ($2 = $3 OR t.leader_id = $3 OR $4 = 'ADMIN')
          RETURNING tm.user_id`,
        [teamId, userId, me.id, me.role],
      );
      return rows[0];
    },
    { actorId: me.id },
  );
  if (!removed) throw new ApiError(403, 'Not allowed (leaders cannot leave their own team; disband it instead)');
  await syncVectorsSafe('teams', [teamId]);
  return ok({ removed: userId });
});
