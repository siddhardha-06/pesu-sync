import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { handler, ok } from '@/lib/http';
import { ensureVector, matchFilter, searchByVector } from '@/lib/vector';

const VECTOR_WEIGHT = 0.75;
const SKILL_WEIGHT = 0.25;

interface TeamRow {
  team_id: number;
  required_skills: string[];
  overlap: string;
  [key: string]: unknown;
}

/**
 * Student -> Team match suggestions.
 *  1. the student's profile vector (Qdrant, created lazily if missing)
 *  2. cosine kNN over team_listings, pre-filtered on payload status = RECRUITING
 *  3. PostgreSQL post-filter (source of truth): still recruiting, open slots,
 *     not my team, not an event I'm already teamed up in
 *  4. hybrid score = 0.75 * cosine + 0.25 * fn_skill_overlap()
 */
export const GET = handler(async () => {
  const me = await requireUser('STUDENT');

  const mySkills = (
    await query<{ name: string }>(
      'SELECT s.name FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id WHERE us.user_id = $1',
      [me.id],
    )
  ).map((r) => r.name);

  const profileVector = await ensureVector('profiles', me.id);
  if (!profileVector) return ok({ suggestions: [], mySkills, hint: 'Add a bio and skills to your profile first.' });

  const hits = await searchByVector('teams', profileVector, { limit: 30, filter: matchFilter('status', 'RECRUITING') });
  const cosineById = new Map(hits.map((h) => [h.id, h.score]));

  const rows = await query<TeamRow>(
    `SELECT o.team_id, o.name, o.category, o.description, o.event_id, o.event_title, o.event_type,
            o.leader_name, o.member_count, o.max_members, o.open_slots, o.required_skills, o.registration_deadline,
            fn_skill_overlap($2, o.team_id) AS overlap,
            EXISTS (SELECT 1 FROM join_requests jr
                     WHERE jr.team_id = o.team_id AND jr.user_id = $2 AND jr.status = 'PENDING') AS requested
       FROM UNNEST($1::INT[]) WITH ORDINALITY AS hit(team_id, pos)
       JOIN v_active_recruiting_teams o ON o.team_id = hit.team_id
      WHERE o.leader_id <> $2
        AND NOT EXISTS (SELECT 1
                          FROM team_members tm JOIN teams t ON t.team_id = tm.team_id
                         WHERE tm.user_id = $2 AND t.event_id = o.event_id AND t.status <> 'DISBANDED')
      ORDER BY hit.pos`,
    [hits.map((h) => h.id), me.id],
  );

  const suggestions = rows
    .map((r) => {
      const cos = cosineById.get(r.team_id) ?? 0;
      const overlap = Number(r.overlap);
      return {
        ...r,
        cosine: Number(cos.toFixed(4)),
        overlap,
        score: Number((VECTOR_WEIGHT * cos + SKILL_WEIGHT * overlap).toFixed(4)),
        matchedSkills: r.required_skills.filter((s) => mySkills.includes(s)),
        missingSkills: r.required_skills.filter((s) => !mySkills.includes(s)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return ok({ suggestions, mySkills, weights: { vector: VECTOR_WEIGHT, skills: SKILL_WEIGHT } });
});
