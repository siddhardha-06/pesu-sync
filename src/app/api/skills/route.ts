import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';

// Public: the registration form needs the skill list before login.
export const GET = handler(async () => {
  const skills = await query(
    `SELECT skill_id, name, category
       FROM skills
      ORDER BY category, name`,
  );
  return ok({ skills });
});
