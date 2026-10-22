import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { handler, idParam, ok } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string }> };

/** Finalise the roster: CALL sp_lock_team (checks min size, rejects the pending queue). */
export const POST = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const teamId = idParam((await params).id);
  await withTransaction((client) => client.query('CALL sp_lock_team($1, $2)', [teamId, me.id]), { actorId: me.id });
  await syncVectorsSafe('teams', [teamId]);
  return ok({ locked: true });
});
