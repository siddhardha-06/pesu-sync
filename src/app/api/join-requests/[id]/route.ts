import { requireUser } from '@/lib/auth';
import { queryOne, withTransaction } from '@/lib/db';
import { ApiError, handler, idParam, ok, oneOf, readJson } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/join-requests/:id  { action: "accept" | "reject" }
 * accept -> CALL sp_accept_join_request inside a transaction (row locks + capacity
 *           trigger make concurrent accepts for the last slot safe)
 * reject -> plain UPDATE, authorised in the WHERE clause
 */
export const PATCH = handler<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const requestId = idParam((await params).id);
  const action = oneOf((await readJson(req)).action, 'action', ['accept', 'reject'] as const);

  const request = await queryOne<{ team_id: number }>('SELECT team_id FROM join_requests WHERE request_id = $1', [requestId]);
  if (!request) throw new ApiError(404, 'Join request not found');

  if (action === 'accept') {
    await withTransaction((client) => client.query('CALL sp_accept_join_request($1, $2)', [requestId, me.id]), {
      actorId: me.id,
    });
  } else {
    const rejected = await withTransaction(
      async (client) => {
        const { rows } = await client.query(
          `UPDATE join_requests jr
              SET status = 'REJECTED', decided_at = NOW(), decided_by = $2
             FROM teams t
            WHERE jr.request_id = $1
              AND jr.team_id = t.team_id
              AND jr.status = 'PENDING'
              AND (t.leader_id = $2 OR $3 IN ('FACULTY', 'ADMIN'))
            RETURNING jr.request_id`,
          [requestId, me.id, me.role],
        );
        return rows[0];
      },
      { actorId: me.id },
    );
    if (!rejected) throw new ApiError(403, 'Only the team leader or faculty can reject a pending request');
  }

  await syncVectorsSafe('teams', [request.team_id]); // status may have become FULL
  const updated = await queryOne('SELECT request_id, status, decided_at FROM join_requests WHERE request_id = $1', [requestId]);
  return ok({ request: updated });
});
