import { requireUser } from '@/lib/auth';
import { queryOne, withTransaction } from '@/lib/db';
import { ApiError, handler, idParam, ok, readJson, text } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Peer messaging inside a team. Members read/write; faculty/admin can read (moderation).
 * Both queries run as the matching PostgreSQL role (SET LOCAL ROLE), so Row Level Security
 * on team_messages enforces membership in the database as well as here.
 */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const teamId = idParam((await params).id);
  if (me.role === 'STUDENT') {
    const member = await queryOne('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, me.id]);
    if (!member) throw new ApiError(403, 'Only team members can read team messages');
  }
  const messages = await withTransaction(
    async (client) =>
      (
        await client.query(
          `SELECT m.message_id, m.body, m.sent_at, m.sender_id, u.full_name AS sender_name
             FROM team_messages m JOIN users u ON u.user_id = m.sender_id
            WHERE m.team_id = $1
            ORDER BY m.sent_at DESC
            LIMIT 50`,
          [teamId],
        )
      ).rows,
    { actorId: me.id, dbRole: me.role },
  );
  return ok({ messages: messages.reverse() });
});

// RLS (sender must be the caller) + the BEFORE INSERT trigger (sender must be a member)
export const POST = handler<Ctx>(async (req, { params }) => {
  const me = await requireUser();
  const teamId = idParam((await params).id);
  const body = await readJson(req);
  const message = await withTransaction(
    async (client) =>
      (
        await client.query(
          `INSERT INTO team_messages (team_id, sender_id, body) VALUES ($1, $2, $3)
           RETURNING message_id, body, sent_at`,
          [teamId, me.id, text(body.body, 'Message', { max: 1000 })],
        )
      ).rows[0],
    { actorId: me.id, dbRole: me.role },
  );
  return ok({ message }, 201);
});
