import { requireUser } from '@/lib/auth';
import { query, queryOne, withTransaction } from '@/lib/db';
import { ApiError, handler, int, ok, optionalInt, optionalText, readJson, text } from '@/lib/http';
import { getVector, syncVectorsSafe } from '@/lib/vector';

async function loadProfile(userId: number) {
  const [user, skills, projects] = await Promise.all([
    queryOne(
      `SELECT user_id, full_name, email, srn, department, semester, bio, created_at, last_login_at,
              auth_provider, pesu_verified_at
         FROM users WHERE user_id = $1`,
      [userId],
    ),
    query(
      `SELECT s.skill_id, s.name, s.category, us.proficiency
         FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
        WHERE us.user_id = $1
        ORDER BY us.proficiency DESC, s.name`,
      [userId],
    ),
    query(
      `SELECT project_id, title, description, project_url, year
         FROM past_projects WHERE user_id = $1 ORDER BY year DESC NULLS LAST, project_id`,
      [userId],
    ),
  ]);
  let vectorIndexed: boolean | null = null;
  try {
    vectorIndexed = (await getVector('profiles', userId)) !== null;
  } catch {
    vectorIndexed = null; // Qdrant unreachable
  }
  return { user, skills, projects, vectorIndexed };
}

export const GET = handler(async () => {
  const me = await requireUser('STUDENT');
  return ok(await loadProfile(me.id));
});

/**
 * Replaces bio/semester/department, the skill set and past projects in ONE
 * transaction, then re-embeds the profile into Qdrant.
 */
export const PUT = handler(async (req) => {
  const me = await requireUser('STUDENT');
  const body = await readJson(req);

  const skills = (Array.isArray(body.skills) ? body.skills : []).map((s: Record<string, unknown>) => ({
    skill_id: int(s.skillId, 'skillId', { min: 1 }),
    proficiency: int(s.proficiency ?? 3, 'proficiency'),
  }));
  const projects = (Array.isArray(body.projects) ? body.projects : []).map((p: Record<string, unknown>) => ({
    title: text(p.title, 'Project title', { max: 120 }),
    description: optionalText(p.description, 'Project description', 2000),
    project_url: optionalText(p.projectUrl, 'Project URL', 255),
    year: optionalInt(p.year, 'Project year'),
  }));
  if (skills.length > 25) throw new ApiError(400, 'At most 25 skills');
  if (projects.length > 10) throw new ApiError(400, 'At most 10 past projects');

  await withTransaction(
    async (client) => {
      await client.query(
        `UPDATE users
            SET bio = $2,
                semester = COALESCE($3, semester),
                department = COALESCE($4, department)
          WHERE user_id = $1`,
        [me.id, optionalText(body.bio, 'Bio', 2000), optionalInt(body.semester, 'Semester'), optionalText(body.department, 'Department', 60)],
      );
      await client.query('DELETE FROM user_skills WHERE user_id = $1', [me.id]);
      if (skills.length) {
        await client.query(
          `INSERT INTO user_skills (user_id, skill_id, proficiency)
           SELECT $1, s.skill_id, s.proficiency
             FROM jsonb_to_recordset($2::jsonb) AS s(skill_id INT, proficiency SMALLINT)`,
          [me.id, JSON.stringify(skills)],
        );
      }
      await client.query('DELETE FROM past_projects WHERE user_id = $1', [me.id]);
      if (projects.length) {
        await client.query(
          `INSERT INTO past_projects (user_id, title, description, project_url, year)
           SELECT $1, p.title, p.description, p.project_url, p.year
             FROM jsonb_to_recordset($2::jsonb) AS p(title TEXT, description TEXT, project_url TEXT, year SMALLINT)`,
          [me.id, JSON.stringify(projects)],
        );
      }
    },
    { actorId: me.id },
  );

  await syncVectorsSafe('profiles', [me.id]);
  return ok(await loadProfile(me.id));
});
