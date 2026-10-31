-- =====================================================================
-- PESU-Sync | 04_views.sql
-- Views used by dashboards and listings + a materialized view for
-- skill demand/supply analytics.
-- Author: Parth Pandurang Kale (PES1UG24AM184)
-- =====================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_skill_demand;
DROP VIEW IF EXISTS v_active_recruiting_teams, v_team_overview, v_student_profiles,
                    v_event_summary, v_capstone_overview, v_join_request_details;

-- ---------------------------------------------------------------------
-- Every team with its event, leader, member count, open slots,
-- pending-request count and required skills (one row per team).
-- ---------------------------------------------------------------------
CREATE VIEW v_team_overview AS
SELECT t.team_id,
       t.name,
       t.description,
       t.category,
       t.status,
       t.max_members,
       t.deadline,
       t.created_at,
       t.locked_at,
       e.event_id,
       e.title                                   AS event_title,
       e.event_type,
       e.registration_deadline,
       e.end_date                                AS event_end_date,
       t.leader_id,
       u.full_name                               AS leader_name,
       COALESCE(m.member_count, 0)               AS member_count,
       t.max_members - COALESCE(m.member_count, 0) AS open_slots,
       COALESCE(p.pending_requests, 0)           AS pending_requests,
       COALESCE(s.required_skills, '{}')         AS required_skills,
       COALESCE(s.required_skill_ids, '{}')      AS required_skill_ids
  FROM teams t
  JOIN events e ON e.event_id = t.event_id
  JOIN users  u ON u.user_id  = t.leader_id
  LEFT JOIN (SELECT team_id, COUNT(*)::INT AS member_count
               FROM team_members GROUP BY team_id) m ON m.team_id = t.team_id
  LEFT JOIN (SELECT team_id, COUNT(*)::INT AS pending_requests
               FROM join_requests WHERE status = 'PENDING' GROUP BY team_id) p ON p.team_id = t.team_id
  LEFT JOIN (SELECT trs.team_id,
                    ARRAY_AGG(sk.name ORDER BY sk.name)     AS required_skills,
                    ARRAY_AGG(sk.skill_id ORDER BY sk.name) AS required_skill_ids
               FROM team_required_skills trs
               JOIN skills sk ON sk.skill_id = trs.skill_id
              GROUP BY trs.team_id) s ON s.team_id = t.team_id;

-- "Active recruiting teams" for the browse page and dashboards
CREATE VIEW v_active_recruiting_teams AS
SELECT *
  FROM v_team_overview
 WHERE status = 'RECRUITING'
   AND open_slots > 0
   AND registration_deadline >= CURRENT_DATE;

-- ---------------------------------------------------------------------
-- Public student profile (no password hash, no login data)
-- ---------------------------------------------------------------------
CREATE VIEW v_student_profiles AS
SELECT u.user_id,
       u.full_name,
       u.email,
       u.srn,
       u.department,
       u.semester,
       u.bio,
       COALESCE(sk.skills, '{}')   AS skills,
       COALESCE(sk.skill_count, 0) AS skill_count,
       (SELECT COUNT(*)::INT FROM team_members tm WHERE tm.user_id = u.user_id)  AS team_count,
       (SELECT COUNT(*)::INT FROM past_projects pp WHERE pp.user_id = u.user_id) AS project_count
  FROM users u
  LEFT JOIN (SELECT us.user_id,
                    ARRAY_AGG(s.name ORDER BY us.proficiency DESC, s.name) AS skills,
                    COUNT(*)::INT AS skill_count
               FROM user_skills us
               JOIN skills s ON s.skill_id = us.skill_id
              GROUP BY us.user_id) sk ON sk.user_id = u.user_id
 WHERE u.role = 'STUDENT'
   AND u.is_active;

-- ---------------------------------------------------------------------
-- Per-event statistics (GROUP BY + FILTER aggregates)
-- ---------------------------------------------------------------------
CREATE VIEW v_event_summary AS
SELECT e.event_id,
       e.title,
       e.event_type,
       e.description,
       e.start_date,
       e.end_date,
       e.registration_deadline,
       e.min_team_size,
       e.max_team_size,
       e.organizer_id,
       o.full_name AS organizer_name,
       COUNT(t.team_id)::INT                                         AS total_teams,
       COUNT(t.team_id) FILTER (WHERE t.status = 'RECRUITING')::INT  AS recruiting_teams,
       COUNT(t.team_id) FILTER (WHERE t.status = 'LOCKED')::INT      AS locked_teams,
       COALESCE(SUM(fn_team_member_count(t.team_id))
                FILTER (WHERE t.status <> 'DISBANDED'), 0)::INT      AS participants,
       ROUND(AVG(fn_team_member_count(t.team_id)::NUMERIC / t.max_members)
             FILTER (WHERE t.status <> 'DISBANDED') * 100, 1)        AS avg_fill_pct,
       CASE
           WHEN e.end_date < CURRENT_DATE              THEN 'COMPLETED'
           WHEN e.registration_deadline < CURRENT_DATE THEN 'REGISTRATION_CLOSED'
           ELSE 'OPEN'
       END AS phase
  FROM events e
  JOIN users o ON o.user_id = e.organizer_id
  LEFT JOIN teams t ON t.event_id = e.event_id
 GROUP BY e.event_id, o.full_name;

-- ---------------------------------------------------------------------
-- Capstone pitches with proposer / mentor / reviewer / team names
-- ---------------------------------------------------------------------
CREATE VIEW v_capstone_overview AS
SELECT c.capstone_id,
       c.title,
       c.abstract,
       c.domain,
       c.tech_stack,
       c.status,
       c.feedback,
       c.submitted_at,
       c.reviewed_at,
       c.proposer_id,
       p.full_name AS proposer_name,
       p.srn       AS proposer_srn,
       c.mentor_id,
       m.full_name AS mentor_name,
       c.team_id,
       t.name      AS team_name,
       c.reviewed_by,
       r.full_name AS reviewer_name
  FROM capstone_projects c
  JOIN users p      ON p.user_id = c.proposer_id
  LEFT JOIN users m ON m.user_id = c.mentor_id
  LEFT JOIN teams t ON t.team_id = c.team_id
  LEFT JOIN users r ON r.user_id = c.reviewed_by;

-- ---------------------------------------------------------------------
-- Join requests with team, event and student details (leader inbox)
-- ---------------------------------------------------------------------
CREATE VIEW v_join_request_details AS
SELECT jr.request_id,
       jr.status,
       jr.message,
       jr.match_score,
       jr.created_at,
       jr.decided_at,
       jr.team_id,
       t.name       AS team_name,
       t.leader_id,
       t.event_id,
       e.title      AS event_title,
       jr.user_id,
       u.full_name  AS student_name,
       u.srn,
       u.semester,
       COALESCE((SELECT ARRAY_AGG(s.name ORDER BY s.name)
                   FROM user_skills us JOIN skills s ON s.skill_id = us.skill_id
                  WHERE us.user_id = jr.user_id), '{}') AS student_skills,
       d.full_name  AS decided_by_name
  FROM join_requests jr
  JOIN teams  t ON t.team_id  = jr.team_id
  JOIN events e ON e.event_id = t.event_id
  JOIN users  u ON u.user_id  = jr.user_id
  LEFT JOIN users d ON d.user_id = jr.decided_by;

-- ---------------------------------------------------------------------
-- MATERIALIZED VIEW: skill demand (teams asking) vs supply (students having).
-- Expensive to compute, read on every dashboard load, so it is stored and
-- refreshed on demand:  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_skill_demand;
-- ---------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_skill_demand AS
SELECT s.skill_id,
       s.name,
       s.category,
       COUNT(DISTINCT trs.team_id) FILTER (WHERE t.status = 'RECRUITING') AS open_demand,
       COUNT(DISTINCT trs.team_id)                                       AS total_demand,
       COUNT(DISTINCT us.user_id)                                        AS supply,
       NOW()                                                             AS refreshed_at
  FROM skills s
  LEFT JOIN team_required_skills trs ON trs.skill_id = s.skill_id
  LEFT JOIN teams t                  ON t.team_id    = trs.team_id
  LEFT JOIN user_skills us           ON us.skill_id  = s.skill_id
 GROUP BY s.skill_id, s.name, s.category;

-- a unique index is required for REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX uq_mv_skill_demand ON mv_skill_demand(skill_id);
