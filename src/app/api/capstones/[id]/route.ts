import { requireUser } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { ApiError, handler, idParam, ok, oneOf, optionalInt, optionalText, readJson, text } from '@/lib/http';
import { ensureVector, excludeIds, searchByVector, syncVectorsSafe } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string }> };

interface CapstoneRow {
  capstone_id: number;
  proposer_id: number;
  status: string;
}

export const GET = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const id = idParam((await params).id);
  const capstone = await queryOne<CapstoneRow>('SELECT * FROM v_capstone_overview WHERE capstone_id = $1', [id]);
  if (!capstone) throw new ApiError(404, 'Capstone not found');
  const isOwner = capstone.proposer_id === me.id;
  if (me.role === 'STUDENT' && !isOwner && !['SUBMITTED', 'APPROVED'].includes(capstone.status)) {
    throw new ApiError(403, 'This pitch is private to its proposer');
  }

  // Near-duplicate detection: nearest pitches in Qdrant (excluding this one)
  let similar: unknown[] = [];
  try {
    const vector = await ensureVector('capstones', id);
    if (vector) {
      const hits = await searchByVector('capstones', vector, { limit: 4, filter: excludeIds([id]) });
      const scores = new Map(hits.map((h) => [h.id, h.score]));
      const rows = await query<{ capstone_id: number }>(
        `SELECT capstone_id, title, domain, status, proposer_name
           FROM v_capstone_overview WHERE capstone_id = ANY($1)`,
        [hits.map((h) => h.id)],
      );
      similar = rows
        .map((r) => ({ ...r, similarity: Number((scores.get(r.capstone_id) ?? 0).toFixed(4)) }))
        .sort((a, b) => b.similarity - a.similarity);
    }
  } catch {
    similar = []; // vector DB unavailable
  }

  const history = await query(
    `SELECT a.log_id, a.action, a.old_value, a.new_value, a.created_at, u.full_name AS actor_name
       FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id
      WHERE a.entity = 'capstone_projects' AND a.entity_id = $1
      ORDER BY a.created_at, a.log_id`,
    [id],
  );

  return ok({ capstone, similar, history, viewer: { isOwner, canReview: me.role !== 'STUDENT' } });
});

/**
 * PATCH /api/capstones/:id
 *   faculty/admin: { action: "approve" | "reject", feedback, mentorId? }
 *   proposer:      { action: "resubmit", title?, abstract?, techStack? }   (only after a rejection)
 * The audit trigger records SUBMITTED -> APPROVED/REJECTED -> SUBMITTED with the actor.
 */
export const PATCH = handler<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const id = idParam((await params).id);
  const body = await readJson(req);
  const action = oneOf(body.action, 'action', ['approve', 'reject', 'resubmit'] as const);

  const updated = await withTransaction(
    async (client) => {
      if (action === 'resubmit') {
        const { rows } = await client.query(
          `UPDATE capstone_projects
              SET status = 'SUBMITTED',
                  title = COALESCE($3, title),
                  abstract = COALESCE($4, abstract),
                  tech_stack = COALESCE($5, tech_stack),
                  submitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL
            WHERE capstone_id = $1 AND proposer_id = $2 AND status = 'REJECTED'
            RETURNING capstone_id, status`,
          [
            id,
            me.id,
            optionalText(body.title, 'Title', 150),
            optionalText(body.abstract, 'Abstract', 5000),
            optionalText(body.techStack, 'Tech stack', 255),
          ],
        );
        if (!rows[0]) throw new ApiError(409, 'Only the proposer can resubmit, and only after a rejection');
        return rows[0];
      }

      if (me.role === 'STUDENT') throw new ApiError(403, 'Only faculty or admins review capstones');
      const feedback = action === 'reject' ? text(body.feedback, 'Feedback', { max: 2000 }) : optionalText(body.feedback, 'Feedback', 2000);
      const { rows } = await client.query(
        `UPDATE capstone_projects
            SET status      = $2::VARCHAR,
                feedback    = $3,
                mentor_id   = COALESCE($4, mentor_id, CASE WHEN $2::VARCHAR = 'APPROVED' AND $6 = 'FACULTY' THEN $5::INT END),
                reviewed_by = $5,
                reviewed_at = NOW()
          WHERE capstone_id = $1 AND status = 'SUBMITTED'
          RETURNING capstone_id, status`,
        [id, action === 'approve' ? 'APPROVED' : 'REJECTED', feedback, optionalInt(body.mentorId, 'Mentor'), me.id, me.role],
      );
      if (!rows[0]) throw new ApiError(409, 'Only SUBMITTED pitches can be reviewed');
      return rows[0];
    },
    { actorId: me.id },
  );

  await syncVectorsSafe('capstones', [id]);
  return ok({ capstone: updated });
});
