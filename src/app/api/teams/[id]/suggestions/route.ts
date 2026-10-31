import { requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { ApiError, handler, idParam, ok } from '@/lib/http';
import { ensureVector, searchByVector } from '@/lib/vector';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Team -> Student suggestions for the team leader (or faculty/admin):
 * kNN over student_profiles using the team listing's vector, then SQL removes
 * students already in a team for this event; ranked by 0.75*cosine + 0.25*skill overlap.
 */
export const GET = handler<Ctx>(async (_req, { params }) => {
  const me = await requireUser();
  const teamId = idParam((await params).id);
  const team = await queryOne<{ leader_id: number; event_id: number; required_skills: string[] }>(
    'SELECT leader_id, event_id, required_skills FROM v_team_overview WHERE team_id = $1',
    [teamId],
  );
  if (!team) throw new ApiError(404, 'Team not found');
  if (team.leader_id !== me.id && me.role === 'STUDENT') throw new ApiError(403, 'Only the team leader sees candidate suggestions');

  const teamVector = await ensureVector('teams', teamId);
  if (!teamVector) return ok({ suggestions: [] });
  const hits = await searchByVector('profiles', teamVector, { limit: 30 });
  const cosineById = new Map(hits.map((h) => [h.id, h.score]));

  const rows = await query<{ user_id: number; skills: string[]; overlap: string }>(
    `SELECT p.user_id, p.full_name, p.email, p.department, p.semester, p.bio, p.skills,
            fn_skill_overlap(p.user_id, $2) AS overlap
       FROM UNNEST($1::INT[]) WITH ORDINALITY AS hit(user_id, pos)
       JOIN v_student_profiles p ON p.user_id = hit.user_id
      WHERE NOT EXISTS (SELECT 1
                          FROM team_members tm JOIN teams t ON t.team_id = tm.team_id
                         WHERE tm.user_id = p.user_id AND t.event_id = $3 AND t.status <> 'DISBANDED')
      ORDER BY hit.pos`,
    [hits.map((h) => h.id), teamId, team.event_id],
  );

  const suggestions = rows
    .map((r) => {
      const cos = cosineById.get(r.user_id) ?? 0;
      const overlap = Number(r.overlap);
      return {
        ...r,
        cosine: Number(cos.toFixed(4)),
        overlap,
        score: Number((0.75 * cos + 0.25 * overlap).toFixed(4)),
        matchedSkills: r.skills.filter((s) => team.required_skills.includes(s)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return ok({ suggestions });
});
