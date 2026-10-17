-- =====================================================================
-- PESU-Sync | important_queries.sql
-- The main DML / analytical queries used by the application, collected
-- in one place for the demo. $1, $2 ... are bind parameters supplied by
-- the API layer (node-postgres parameterised queries -> no SQL injection).
-- Author: Parth Pandurang Kale (PES1UG24AM184)
-- =====================================================================

-- Q1. INSERT inside a transaction: register a student + skills (api/auth/register)
BEGIN;
INSERT INTO users (full_name, email, password_hash, role, srn, department, semester, bio)
VALUES ($1, $2, $3, 'STUDENT', $4, $5, $6, $7)
RETURNING user_id;
INSERT INTO user_skills (user_id, skill_id, proficiency)
SELECT $1, s.skill_id, s.proficiency
  FROM jsonb_to_recordset($2::jsonb) AS s(skill_id INT, proficiency SMALLINT);
COMMIT;

-- Q2. UPDATE: successful login resets the brute-force counter (api/auth/login)
UPDATE users SET last_login_at = NOW(), failed_logins = 0 WHERE user_id = $1;

-- Q3. DELETE: a member leaves a team -> trigger flips FULL back to RECRUITING
DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 AND member_role = 'MEMBER';

-- Q4. SELECT with JOIN + filters: browse recruiting teams that need a given skill
SELECT o.*
  FROM v_active_recruiting_teams o
 WHERE ($1::INT IS NULL OR o.event_id = $1)
   AND ($2::INT IS NULL OR $2 = ANY (o.required_skill_ids))
 ORDER BY o.open_slots DESC, o.created_at DESC;

-- Q5. Correlated NOT EXISTS subquery: open events the student has not joined
SELECT es.event_id, es.title, es.registration_deadline
  FROM v_event_summary es
 WHERE es.phase = 'OPEN'
   AND NOT EXISTS (SELECT 1
                     FROM team_members tm JOIN teams t ON t.team_id = tm.team_id
                    WHERE tm.user_id = $1 AND t.event_id = es.event_id AND t.status <> 'DISBANDED')
 ORDER BY es.registration_deadline;

-- Q6. GROUP BY + HAVING: skills recruiting teams need more than students offer
SELECT s.name,
       COUNT(DISTINCT trs.team_id) AS teams_needing,
       COUNT(DISTINCT us.user_id)  AS students_with
  FROM skills s
  JOIN team_required_skills trs ON trs.skill_id = s.skill_id
  JOIN teams t                  ON t.team_id = trs.team_id AND t.status = 'RECRUITING'
  LEFT JOIN user_skills us      ON us.skill_id = s.skill_id
 GROUP BY s.name
HAVING COUNT(DISTINCT trs.team_id) * 2 > COUNT(DISTINCT us.user_id)
 ORDER BY teams_needing DESC;

-- Q7. Aggregates with FILTER: users per role, active users per role
SELECT role, COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active
  FROM users GROUP BY role ORDER BY role;

-- Q8. Window function: rank departments by students already in a team
SELECT department, students, in_teams,
       RANK() OVER (ORDER BY in_teams DESC) AS rank
  FROM (SELECT u.department,
               COUNT(*) AS students,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM team_members tm WHERE tm.user_id = u.user_id)) AS in_teams
          FROM users u
         WHERE u.role = 'STUDENT' AND u.is_active
         GROUP BY u.department) d;

-- Q9. Aggregate on intervals: average faculty review turnaround (hours)
SELECT ROUND(AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600)::NUMERIC, 1) AS avg_review_hours
  FROM capstone_projects
 WHERE reviewed_at IS NOT NULL;

-- Q10. Stored procedure inside a transaction: accept a join request (api/join-requests/[id])
BEGIN;
CALL sp_accept_join_request($1, $2);
COMMIT;

-- Q11. Stored function in ORDER BY: rank candidate teams by skill overlap
SELECT t.team_id, t.name, fn_skill_overlap($1, t.team_id) AS overlap
  FROM teams t
 WHERE t.status = 'RECRUITING'
 ORDER BY overlap DESC
 LIMIT 10;

-- Q12. Full-text search with ranking + highlighted snippet (05_fulltext_search.sql)
SELECT * FROM fn_search_capstones('machine learning healthcare', 10);

-- Q13. Resolve vector-search hits back to SQL rows, keeping Qdrant's order
SELECT o.*
  FROM UNNEST($1::INT[]) WITH ORDINALITY AS hit(team_id, pos)
  JOIN v_team_overview o ON o.team_id = hit.team_id
 ORDER BY hit.pos;

-- Q14. Materialized view refresh (admin action) and read
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_demand;
SELECT name, open_demand, total_demand, supply FROM mv_skill_demand ORDER BY open_demand DESC LIMIT 10;

-- Q15. Audit trail of one capstone (who moved it from SUBMITTED to APPROVED)
SELECT a.created_at, a.action, a.old_value, a.new_value, u.full_name AS actor
  FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id
 WHERE a.entity = 'capstone_projects' AND a.entity_id = $1
 ORDER BY a.created_at;
