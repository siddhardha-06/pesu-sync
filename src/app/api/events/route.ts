import { requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { dateStr, handler, int, ok, oneOf, optionalText, readJson, text } from '@/lib/http';

const EVENT_TYPES = ['HACKATHON', 'COURSEWORK', 'CAPSTONE', 'COMPETITION', 'WORKSHOP'] as const;
const PHASES = ['OPEN', 'REGISTRATION_CLOSED', 'COMPLETED'] as const;

export const GET = handler(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || null;
  const phase = url.searchParams.get('phase') || null;
  if (type) oneOf(type, 'type', EVENT_TYPES);
  if (phase) oneOf(phase, 'phase', PHASES);

  const events = await query(
    `SELECT *
       FROM v_event_summary
      WHERE ($1::TEXT IS NULL OR event_type = $1)
        AND ($2::TEXT IS NULL OR phase = $2)
      ORDER BY CASE phase WHEN 'OPEN' THEN 0 WHEN 'REGISTRATION_CLOSED' THEN 1 ELSE 2 END, start_date`,
    [type, phase],
  );
  return ok({ events });
});

export const POST = handler(async (req) => {
  const user = await requireUser('FACULTY', 'ADMIN');
  const body = await readJson(req);

  const event = await queryOne(
    `INSERT INTO events (title, event_type, description, organizer_id, start_date, end_date,
                         registration_deadline, min_team_size, max_team_size)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING event_id`,
    [
      text(body.title, 'Title', { min: 3, max: 120 }),
      oneOf(body.eventType, 'Event type', EVENT_TYPES),
      optionalText(body.description, 'Description'),
      user.id,
      dateStr(body.startDate, 'Start date'),
      dateStr(body.endDate, 'End date'),
      dateStr(body.registrationDeadline, 'Registration deadline'),
      int(body.minTeamSize ?? 1, 'Min team size'),
      int(body.maxTeamSize ?? 4, 'Max team size'),
    ],
  );
  return ok({ event }, 201);
});
