-- =====================================================================
-- PESU-Sync | 07_reports.sql
-- Report queries shown on /reports (faculty + admin): CTEs, a RECURSIVE
-- CTE, window functions, correlated subqueries, GROUP BY / HAVING.
-- Author: P Manas Siddhardha (PES1UG24AM186)
-- =====================================================================

DROP VIEW IF EXISTS v_report_department, v_report_event_teams, v_report_capstone_domains,
                    v_report_top_skills, v_report_match_quality;
DROP FUNCTION IF EXISTS fn_collaboration_network(INT, INT);

-- R1. Per department (like "average salary per department"):
--     students, average skills per student, average proficiency, share already in a team
CREATE VIEW v_report_department AS
WITH student_stats AS (                                   -- CTE 1: one row per active student
    SELECT u.user_id,
           u.department,
           COUNT(us.skill_id)                     AS skills,
           AVG(us.proficiency)                    AS avg_proficiency,
           EXISTS (SELECT 1 FROM team_members tm   -- correlated subquery
                    WHERE tm.user_id = u.user_id) AS in_team
      FROM users u
      LEFT JOIN user_skills us ON us.user_id = u.user_id
     WHERE u.role = 'STUDENT' AND u.is_active
     GROUP BY u.user_id, u.department
)
SELECT department,
       COUNT(*)::INT                                                    AS students,
       ROUND(AVG(skills), 2)                                            AS avg_skills_per_student,
       ROUND(AVG(avg_proficiency), 2)                                   AS avg_proficiency,
       ROUND(100.0 * COUNT(*) FILTER (WHERE in_team) / COUNT(*), 1)     AS pct_in_team
  FROM student_stats
 GROUP BY department
 ORDER BY students DESC, department;

-- R2. Per event: average team size and fill, ranked by participation (window function)
CREATE VIEW v_report_event_teams AS
WITH team_sizes AS (
    SELECT t.event_id, t.team_id, t.max_members, fn_team_member_count(t.team_id) AS members
      FROM teams t
     WHERE t.status <> 'DISBANDED'
)
SELECT e.event_id,
       e.title,
       e.event_type,
       COUNT(ts.team_id)::INT                                            AS teams,
       COALESCE(SUM(ts.members), 0)::INT                                 AS participants,
       ROUND(AVG(ts.members), 2)                                         AS avg_team_size,
       ROUND(100.0 * AVG(ts.members::NUMERIC / NULLIF(ts.max_members, 0)), 1) AS avg_fill_pct,
       RANK() OVER (ORDER BY COALESCE(SUM(ts.members), 0) DESC)          AS participation_rank
  FROM events e
  LEFT JOIN team_sizes ts ON ts.event_id = e.event_id
 GROUP BY e.event_id, e.title, e.event_type;

-- R3. Capstone domains: approval rate and average faculty review time (HAVING keeps reviewed domains)
CREATE VIEW v_report_capstone_domains AS
SELECT domain,
       COUNT(*)::INT                                                            AS pitches,
       COUNT(*) FILTER (WHERE status = 'APPROVED')::INT                         AS approved,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::INT                         AS rejected,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'APPROVED')
             / NULLIF(COUNT(*) FILTER (WHERE status IN ('APPROVED', 'REJECTED')), 0), 1) AS approval_rate_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 3600)::NUMERIC, 1) AS avg_review_hours
  FROM capstone_projects
 GROUP BY domain
HAVING COUNT(*) >= 1
 ORDER BY pitches DESC, domain;

-- R4. Top 3 skills held by students in each skill category (ROW_NUMBER over a CTE)
CREATE VIEW v_report_top_skills AS
WITH holders AS (
    SELECT s.category, s.name, COUNT(us.user_id)::INT AS students,
           ROUND(AVG(us.proficiency), 2) AS avg_proficiency
      FROM skills s
      JOIN user_skills us ON us.skill_id = s.skill_id
     GROUP BY s.category, s.name
), ranked AS (
    SELECT h.*, ROW_NUMBER() OVER (PARTITION BY h.category ORDER BY h.students DESC, h.name) AS rank_in_category
      FROM holders h
)
SELECT category, rank_in_category, name, students, avg_proficiency
  FROM ranked
 WHERE rank_in_category <= 3
 ORDER BY category, rank_in_category;

-- R5. Does the semantic match score predict the leader's decision?
--     Average stored cosine score per request outcome, compared with the overall average (scalar subquery)
CREATE VIEW v_report_match_quality AS
SELECT status,
       COUNT(*)::INT                         AS requests,
       ROUND(AVG(match_score), 3)            AS avg_match_score,
       ROUND(AVG(match_score) - (SELECT AVG(match_score) FROM join_requests WHERE match_score IS NOT NULL), 3)
                                             AS diff_from_overall
  FROM join_requests
 WHERE match_score IS NOT NULL
 GROUP BY status
 ORDER BY avg_match_score DESC;

-- R6. RECURSIVE: a student's collaboration network.
--     Depth 1 = people who were in a team with them, depth 2 = teammates of those teammates, ...
CREATE FUNCTION fn_collaboration_network(p_user_id INT, p_max_depth INT DEFAULT 3)
RETURNS TABLE (user_id INT, full_name VARCHAR, depth INT, via_team VARCHAR)
LANGUAGE sql STABLE AS $$
    WITH RECURSIVE network (user_id, depth, via_team, path) AS (
        SELECT p_user_id, 0, NULL::VARCHAR, ARRAY[p_user_id]          -- anchor: the student
      UNION ALL
        SELECT other.user_id, n.depth + 1, t.name, n.path || other.user_id
          FROM network n
          JOIN team_members mine  ON mine.user_id = n.user_id
          JOIN teams t            ON t.team_id = mine.team_id AND t.status <> 'DISBANDED'
          JOIN team_members other ON other.team_id = mine.team_id AND other.user_id <> n.user_id
         WHERE n.depth < p_max_depth
           AND NOT other.user_id = ANY (n.path)                          -- no cycles
    )
    SELECT DISTINCT ON (n.user_id) n.user_id, u.full_name, n.depth, n.via_team
      FROM network n
      JOIN users u ON u.user_id = n.user_id
     WHERE n.depth > 0
     ORDER BY n.user_id, n.depth
$$;
