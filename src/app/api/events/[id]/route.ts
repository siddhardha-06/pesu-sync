import { requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ApiError, dateStr, handler, idParam, ok, optionalText, readJson } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (_req, { params }) => {
  await requireUser();
  const id = idParam((await params).id);
  const event = await queryOne('SELECT * FROM v_event_summary WHERE event_id = $1', [id]);
  if (!event) throw new ApiError(404, 'Event not found');
  const teams = await query(
    `SELECT team_id, name, category, status, member_count, max_members, open_slots,
            leader_name, required_skills, pending_requests
       FROM v_team_overview
      WHERE event_id = $1
      ORDER BY CASE status WHEN 'RECRUITING' THEN 0 WHEN 'FULL' THEN 1 WHEN 'LOCKED' THEN 2 ELSE 3 END, name`,
    [id],
  );
  return ok({ event, teams });
});

// Organiser (or admin) can edit the description and the registration deadline
export const PATCH = handler<Ctx>(async (req, { params }) => {
  const user = await requireUser('FACULTY', 'ADMIN');
  const id = idParam((await params).id);
  const body = await readJson(req);
  const updated = await queryOne(
    `UPDATE events
        SET description           = COALESCE($3, description),
            registration_deadline = COALESCE($4::DATE, registration_deadline)
      WHERE event_id = $1
        AND (organizer_id = $2 OR EXISTS (SELECT 1 FROM users WHERE user_id = $2 AND role = 'ADMIN'))
      RETURNING event_id`,
    [
      id,
      user.id,
      optionalText(body.description, 'Description'),
      body.registrationDeadline ? dateStr(body.registrationDeadline, 'Registration deadline') : null,
    ],
  );
  if (!updated) throw new ApiError(403, 'Only the organiser or an admin can edit this event');
  return ok({ event: updated });
});

// An event can be deleted only while no team has been formed in it
export const DELETE = handler<Ctx>(async (_req, { params }) => {
  const user = await requireUser('FACULTY', 'ADMIN');
  const id = idParam((await params).id);
  const deleted = await queryOne(
    `DELETE FROM events
      WHERE event_id = $1
        AND (organizer_id = $2 OR EXISTS (SELECT 1 FROM users WHERE user_id = $2 AND role = 'ADMIN'))
        AND NOT EXISTS (SELECT 1 FROM teams WHERE event_id = $1)
      RETURNING event_id`,
    [id, user.id],
  );
  if (!deleted) throw new ApiError(409, 'Event not found, not yours, or it already has teams');
  return ok({ deleted: id });
});
