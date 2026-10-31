import { requireUser } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { handler, ok } from '@/lib/http';

// Role-based dashboard data. Each block below is one of the "important queries"
// documented in db/queries/important_queries.sql.

async function studentDashboard(userId: number) {
  const [stats, myTeams, myRequests, incoming, myCapstones, openEvents] = await Promise.all([
    queryOne(
      `SELECT (SELECT COUNT(*)::INT FROM team_members WHERE user_id = $1)                          AS my_teams,
              (SELECT COUNT(*)::INT FROM join_requests WHERE user_id = $1 AND status = 'PENDING')  AS my_pending,
              (SELECT COUNT(*)::INT FROM join_requests jr JOIN teams t ON t.team_id = jr.team_id
                WHERE t.leader_id = $1 AND jr.status = 'PENDING')                                 AS to_review,
              (SELECT COUNT(*)::INT FROM capstone_projects WHERE proposer_id = $1)                 AS my_capstones`,
      [userId],
    ),
    query(
      `SELECT o.team_id, o.name, o.status, o.event_title, o.member_count, o.max_members, tm.member_role
         FROM v_team_overview o
         JOIN team_members tm ON tm.team_id = o.team_id
        WHERE tm.user_id = $1
        ORDER BY o.created_at DESC`,
      [userId],
    ),
    query(
      `SELECT request_id, team_id, team_name, event_title, status, created_at, decided_by_name
         FROM v_join_request_details
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 8`,
      [userId],
    ),
    query(
      `SELECT request_id, team_id, team_name, student_name, student_skills, match_score, created_at
         FROM v_join_request_details
        WHERE leader_id = $1 AND status = 'PENDING'
        ORDER BY match_score DESC NULLS LAST, created_at`,
      [userId],
    ),
    query(
      `SELECT capstone_id, title, domain, status, mentor_name, submitted_at
         FROM v_capstone_overview WHERE proposer_id = $1 ORDER BY submitted_at DESC`,
      [userId],
    ),
    // Open events the student has NOT joined yet (NOT EXISTS subquery)
    query(
      `SELECT es.event_id, es.title, es.event_type, es.registration_deadline, es.recruiting_teams
         FROM v_event_summary es
        WHERE es.phase = 'OPEN'
          AND NOT EXISTS (SELECT 1
                            FROM team_members tm
                            JOIN teams t ON t.team_id = tm.team_id
                           WHERE tm.user_id = $1
                             AND t.event_id = es.event_id
                             AND t.status <> 'DISBANDED')
        ORDER BY es.registration_deadline`,
      [userId],
    ),
  ]);
  return { stats, myTeams, myRequests, incoming, myCapstones, openEvents };
}

async function facultyDashboard(userId: number) {
  const [stats, pendingReviews, mentees, myEvents, skillGaps] = await Promise.all([
    queryOne(
      `SELECT (SELECT COUNT(*)::INT FROM capstone_projects WHERE status = 'SUBMITTED') AS pending_reviews,
              (SELECT COUNT(*)::INT FROM capstone_projects WHERE mentor_id = $1)       AS mentees,
              (SELECT COUNT(*)::INT FROM events WHERE organizer_id = $1)               AS my_events,
              (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600)::NUMERIC, 1)
                 FROM capstone_projects WHERE reviewed_at IS NOT NULL)                 AS avg_review_hours`,
      [userId],
    ),
    query(
      `SELECT capstone_id, title, domain, proposer_name, submitted_at
         FROM v_capstone_overview WHERE status = 'SUBMITTED' ORDER BY submitted_at`,
    ),
    query(
      `SELECT capstone_id, title, status, proposer_name, team_name
         FROM v_capstone_overview WHERE mentor_id = $1 ORDER BY title`,
      [userId],
    ),
    query(
      `SELECT event_id, title, event_type, phase, total_teams, locked_teams, participants, avg_fill_pct
         FROM v_event_summary WHERE organizer_id = $1 ORDER BY start_date`,
      [userId],
    ),
    // Skills that recruiting teams need more often than students offer them (GROUP BY + HAVING)
    query(
      `SELECT s.name,
              COUNT(DISTINCT trs.team_id)::INT AS teams_needing,
              COUNT(DISTINCT us.user_id)::INT  AS students_with
         FROM skills s
         JOIN team_required_skills trs ON trs.skill_id = s.skill_id
         JOIN teams t                  ON t.team_id = trs.team_id AND t.status = 'RECRUITING'
         LEFT JOIN user_skills us      ON us.skill_id = s.skill_id
        GROUP BY s.name
       HAVING COUNT(DISTINCT trs.team_id) * 2 > COUNT(DISTINCT us.user_id)
        ORDER BY teams_needing DESC, s.name
        LIMIT 8`,
    ),
  ]);
  return { stats, pendingReviews, mentees, myEvents, skillGaps };
}

async function adminDashboard() {
  const [usersByRole, teamsByStatus, capstonesByStatus, topEvents, skillDemand, departments, recentAudit] =
    await Promise.all([
      query(
        `SELECT role, COUNT(*)::INT AS total, COUNT(*) FILTER (WHERE is_active)::INT AS active
           FROM users GROUP BY role ORDER BY role`,
      ),
      query(`SELECT status, COUNT(*)::INT AS total FROM teams GROUP BY status ORDER BY total DESC`),
      query(`SELECT status, COUNT(*)::INT AS total FROM capstone_projects GROUP BY status ORDER BY total DESC`),
      query(
        `SELECT event_id, title, phase, total_teams, participants, avg_fill_pct
           FROM v_event_summary ORDER BY participants DESC, total_teams DESC LIMIT 5`,
      ),
      query(
        `SELECT name, category, open_demand, total_demand, supply, refreshed_at
           FROM mv_skill_demand
          WHERE total_demand > 0
          ORDER BY open_demand DESC, total_demand DESC, name
          LIMIT 10`,
      ),
      // Departments ranked by how many of their students are in a team (window function)
      query(
        `SELECT department, students, in_teams,
                ROUND(100.0 * in_teams / NULLIF(students, 0), 1) AS pct_in_teams,
                RANK() OVER (ORDER BY in_teams DESC)            AS rank
           FROM (SELECT u.department,
                        COUNT(*)::INT AS students,
                        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM team_members tm
                                                        WHERE tm.user_id = u.user_id))::INT AS in_teams
                   FROM users u
                  WHERE u.role = 'STUDENT' AND u.is_active
                  GROUP BY u.department) d
          ORDER BY rank, department`,
      ),
      query(
        `SELECT a.log_id, a.entity, a.entity_id, a.action, a.old_value, a.new_value, a.created_at,
                u.full_name AS actor_name
           FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id
          ORDER BY a.created_at DESC, a.log_id DESC
          LIMIT 10`,
      ),
    ]);
  return { usersByRole, teamsByStatus, capstonesByStatus, topEvents, skillDemand, departments, recentAudit };
}

export const GET = handler(async () => {
  const user = await requireUser();
  const data =
    user.role === 'STUDENT'
      ? await studentDashboard(user.id)
      : user.role === 'FACULTY'
        ? await facultyDashboard(user.id)
        : await adminDashboard();
  return ok({ role: user.role, user, ...data });
});
