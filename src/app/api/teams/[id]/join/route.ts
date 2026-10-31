import { requireUser } from '@/lib/auth';
import { withTransaction } from '@/lib/db';
import { cosine } from '@/lib/embeddings';
import { ApiError, handler, idParam, ok, optionalText, readJson } from '@/lib/http';
import { ensureVector } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string }> };

/** Student requests to join. The BEFORE INSERT trigger validates team state, deadline and duplicates. */
export const POST = handler<Ctx>(async (req, { params }) => {
  const me = await requireUser('STUDENT');
  const teamId = idParam((await params).id);
  const body = await readJson(req);

  // Semantic fit between the student's profile and the team listing (shown to the leader)
  let matchScore: number | null = null;
  try {
    const [profileVec, teamVec] = await Promise.all([ensureVector('profiles', me.id), ensureVector('teams', teamId)]);
    if (profileVec && teamVec) matchScore = Number(cosine(profileVec, teamVec).toFixed(4));
  } catch {
    matchScore = null; // vector DB down: the request still goes through
  }

  const request = await withTransaction(
    async (client) => {
      const { rows } = await client.query(
        `INSERT INTO join_requests (team_id, user_id, message, match_score)
         VALUES ($1, $2, $3, $4)
         RETURNING request_id, status, match_score`,
        [teamId, me.id, optionalText(body.message, 'Message', 500), matchScore],
      );
      return rows[0];
    },
    { actorId: me.id },
  );
  return ok({ request }, 201);
});

/** Student withdraws their pending request. */
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser('STUDENT');
  const teamId = idParam((await params).id);
  const withdrawn = await withTransaction(
    async (client) => {
      const { rows } = await client.query(
        `UPDATE join_requests
            SET status = 'WITHDRAWN', decided_at = NOW(), decided_by = $2
          WHERE team_id = $1 AND user_id = $2 AND status = 'PENDING'
          RETURNING request_id`,
        [teamId, me.id],
      );
      return rows[0];
    },
    { actorId: me.id },
  );
  if (!withdrawn) throw new ApiError(404, 'No pending request to withdraw');
  return ok({ withdrawn: withdrawn.request_id });
});
