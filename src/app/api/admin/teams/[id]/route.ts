import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { ApiError, handler, idParam, ok, oneOf, readJson } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

/**
 * PATCH /api/admin/teams/:id { action: "disband" }
 * Disbands a team (kept for history) and rejects its pending requests, atomically.
 */
export const PATCH = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const admin = await requireUser('ADMIN');
  const id = idParam((await params).id);
  oneOf((await readJson(req)).action, 'action', ['disband'] as const);

  const result = await withTransaction(
    async (client) => {
      const team = await client.query(
        `UPDATE teams SET status = 'DISBANDED' WHERE team_id = $1 AND status <> 'DISBANDED' RETURNING team_id`,
        [id],
      );
      if (team.rowCount === 0) throw new ApiError(409, 'Team not found or already disbanded');
      const rejected = await client.query(
        `UPDATE join_requests SET status = 'REJECTED', decided_at = NOW(), decided_by = $2
          WHERE team_id = $1 AND status = 'PENDING'`,
        [id, admin.id],
      );
      return { teamId: id, rejectedRequests: rejected.rowCount };
    },
    { actorId: admin.id },
  );

  await syncVectorsSafe('teams', [id]); // disbanded teams are removed from the vector index
  return ok(result);
});
