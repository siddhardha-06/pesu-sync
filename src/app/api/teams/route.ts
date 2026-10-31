import { requireUser } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { TEAM_CATEGORIES as CATEGORIES, TEAM_STATUSES as STATUSES } from '@/lib/constants';
import { ApiError, handler, int, intList, ok, oneOf, optionalInt, readJson, text } from '@/lib/http';
import { syncVectorsSafe } from '@/lib/vector';

/** GET /api/teams?eventId=&category=&skillId=&q=&status=&mine=1&limit=&offset= */
export const GET = handler(async (req) => {
  const me = await requireUser();
  const p = new URL(req.url).searchParams;
  const eventId = optionalInt(p.get('eventId'), 'eventId');
  const category = p.get('category') ? oneOf(p.get('category'), 'category', CATEGORIES) : null;
  const skillId = optionalInt(p.get('skillId'), 'skillId');
  const q = p.get('q')?.trim() || null;
  const status = p.get('status') ? oneOf(p.get('status'), 'status', STATUSES) : null;
  const mine = p.get('mine') === '1' ? me.id : null;
  const limit = Math.min(Number(p.get('limit')) || 24, 100);
  const offset = Math.max(Number(p.get('offset')) || 0, 0);

  const teams = await query(
    `SELECT o.*, COUNT(*) OVER () AS total_count
       FROM v_team_overview o
      WHERE ($1::INT  IS NULL OR o.event_id = $1)
        AND ($2::TEXT IS NULL OR o.category = $2)
        AND ($3::INT  IS NULL OR $3 = ANY (o.required_skill_ids))
        AND ($4::TEXT IS NULL OR o.name ILIKE '%' || $4 || '%' OR o.description ILIKE '%' || $4 || '%')
        AND ($5::TEXT IS NULL OR o.status = $5)
        AND ($6::INT  IS NULL OR EXISTS (SELECT 1 FROM team_members tm
                                          WHERE tm.team_id = o.team_id AND tm.user_id = $6))
      ORDER BY CASE o.status WHEN 'RECRUITING' THEN 0 WHEN 'FULL' THEN 1 WHEN 'LOCKED' THEN 2 ELSE 3 END,
               o.open_slots DESC, o.created_at DESC
      LIMIT $7 OFFSET $8`,
    [eventId, category, skillId, q, status, mine, limit, offset],
  );
  return ok({ teams, total: Number(teams[0]?.total_count ?? 0) });
});

/**
 * POST /api/teams — a student creates a team listing.
 * Team row + LEADER membership + required skills are written in ONE transaction;
 * triggers reject it if the student already leads/joined a team in the same event.
 */
export const POST = handler(async (req) => {
  const me = await requireUser('STUDENT');
  const body = await readJson(req);
  const eventId = int(body.eventId, 'Event', { min: 1 });
  const skillIds = intList(body.requiredSkillIds, 'Required skills');
  if (skillIds.length > 12) throw new ApiError(400, 'Pick at most 12 required skills');

  const event = await queryOne<{ open: boolean }>(
    'SELECT registration_deadline >= CURRENT_DATE AS open FROM events WHERE event_id = $1',
    [eventId],
  );
  if (!event) throw new ApiError(404, 'Event not found');
  if (!event.open) throw new ApiError(409, 'Registration for this event has closed');

  const team = await withTransaction(
    async (client) => {
      const { rows } = await client.query<{ team_id: number }>(
        `INSERT INTO teams (event_id, leader_id, name, description, category, max_members, deadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING team_id`,
        [
          eventId,
          me.id,
          text(body.name, 'Team name', { min: 3, max: 80 }),
          text(body.description, 'Description', { max: 3000 }),
          oneOf(body.category, 'Category', CATEGORIES),
          int(body.maxMembers, 'Max members'),
          typeof body.deadline === 'string' && body.deadline ? body.deadline : null,
        ],
      );
      const created = rows[0];
      await client.query(`INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1, $2, 'LEADER')`, [
        created.team_id,
        me.id,
      ]);
      if (skillIds.length) {
        await client.query(
          'INSERT INTO team_required_skills (team_id, skill_id) SELECT $1, UNNEST($2::INT[])',
          [created.team_id, skillIds],
        );
      }
      return created;
    },
    { actorId: me.id },
  );

  await syncVectorsSafe('teams', [team.team_id]);
  return ok({ team }, 201);
});
