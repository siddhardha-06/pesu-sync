-- =====================================================================
-- PESU-Sync | 01_schema.sql
-- Core relational schema (DDL): tables, primary/foreign keys,
-- CHECK / UNIQUE / NOT NULL constraints and indexes.
-- Author: P Manas Siddhardha (PES1UG24AM186)
-- =====================================================================

-- ---------------------------------------------------------------------
-- DROP: makes the script re-runnable. CASCADE also removes dependent
-- views, triggers and foreign keys created by later scripts.
-- ---------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS mv_skill_demand CASCADE;
DROP TABLE IF EXISTS
    audit_logs,
    team_messages,
    capstone_projects,
    join_requests,
    team_members,
    team_required_skills,
    teams,
    events,
    past_projects,
    user_skills,
    skills,
    users
CASCADE;

-- ---------------------------------------------------------------------
-- USERS: every campus member (Student / Faculty / Admin)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id        SERIAL        PRIMARY KEY,
    full_name      VARCHAR(100)  NOT NULL,
    email          VARCHAR(120)  NOT NULL,
    password_hash  VARCHAR(100)  NOT NULL,
    role           VARCHAR(10)   NOT NULL DEFAULT 'STUDENT',
    srn            VARCHAR(13),
    department     VARCHAR(60)   NOT NULL DEFAULT 'CSE',
    semester       SMALLINT,
    phone          VARCHAR(15),
    bio            TEXT,
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_email          UNIQUE (email),
    CONSTRAINT uq_users_srn            UNIQUE (srn),
    CONSTRAINT chk_users_name          CHECK (LENGTH(TRIM(full_name)) >= 2),
    CONSTRAINT chk_users_role          CHECK (role IN ('STUDENT', 'FACULTY', 'ADMIN')),
    CONSTRAINT chk_users_email_lower   CHECK (email = LOWER(email)),
    CONSTRAINT chk_users_srn_format    CHECK (srn IS NULL OR srn ~ '^PES[12](UG|PG)[0-9]{2}[A-Z]{2}[0-9]{3}$'),
    CONSTRAINT chk_users_semester      CHECK (semester IS NULL OR semester BETWEEN 1 AND 8),
    -- a student row must carry an SRN and a semester
    CONSTRAINT chk_users_student_info  CHECK (role <> 'STUDENT' OR (srn IS NOT NULL AND semester IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- SKILLS (master list) and USER_SKILLS (M:N with proficiency)
-- ---------------------------------------------------------------------
CREATE TABLE skills (
    skill_id  SERIAL       PRIMARY KEY,
    name      VARCHAR(50)  NOT NULL,
    category  VARCHAR(20)  NOT NULL,
    CONSTRAINT uq_skills_name      UNIQUE (name),
    CONSTRAINT chk_skills_category CHECK (category IN
        ('LANGUAGE', 'FRAMEWORK', 'DATABASE', 'AI_ML', 'DESIGN', 'DEVOPS', 'DOMAIN', 'SOFT_SKILL'))
);

CREATE TABLE user_skills (
    user_id      INT       NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
    skill_id     INT       NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
    proficiency  SMALLINT  NOT NULL DEFAULT 3,
    PRIMARY KEY (user_id, skill_id),
    CONSTRAINT chk_user_skills_proficiency CHECK (proficiency BETWEEN 1 AND 5)
);

-- Past projects shown on a student profile (1:N)
CREATE TABLE past_projects (
    project_id   SERIAL        PRIMARY KEY,
    user_id      INT           NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title        VARCHAR(120)  NOT NULL,
    description  TEXT,
    project_url  VARCHAR(255),
    year         SMALLINT,
    CONSTRAINT chk_past_projects_url  CHECK (project_url IS NULL OR project_url ~ '^https?://'),
    CONSTRAINT chk_past_projects_year CHECK (year IS NULL OR year BETWEEN 2015 AND 2100)
);

-- ---------------------------------------------------------------------
-- EVENTS: hackathons, coursework, capstone cycles ... (organised by faculty/admin)
-- ---------------------------------------------------------------------
CREATE TABLE events (
    event_id               SERIAL        PRIMARY KEY,
    title                  VARCHAR(120)  NOT NULL,
    event_type             VARCHAR(12)   NOT NULL,
    description            TEXT,
    organizer_id           INT           NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    start_date             DATE          NOT NULL,
    end_date               DATE          NOT NULL,
    registration_deadline  DATE          NOT NULL,
    min_team_size          SMALLINT      NOT NULL DEFAULT 1,
    max_team_size          SMALLINT      NOT NULL DEFAULT 4,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_events_title_start UNIQUE (title, start_date),
    CONSTRAINT chk_events_type  CHECK (event_type IN ('HACKATHON', 'COURSEWORK', 'CAPSTONE', 'COMPETITION', 'WORKSHOP')),
    CONSTRAINT chk_events_dates CHECK (end_date >= start_date AND registration_deadline <= end_date),
    CONSTRAINT chk_events_sizes CHECK (min_team_size >= 1 AND max_team_size <= 10 AND min_team_size <= max_team_size)
);

-- ---------------------------------------------------------------------
-- TEAMS: a team listing inside an event, owned by a student leader
-- ---------------------------------------------------------------------
CREATE TABLE teams (
    team_id      SERIAL        PRIMARY KEY,
    event_id     INT           NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    leader_id    INT           NOT NULL REFERENCES users(user_id)   ON DELETE RESTRICT,
    name         VARCHAR(80)   NOT NULL,
    description  TEXT          NOT NULL,
    category     VARCHAR(12)   NOT NULL,
    max_members  SMALLINT      NOT NULL,
    status       VARCHAR(10)   NOT NULL DEFAULT 'RECRUITING',
    deadline     DATE,
    locked_at    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_teams_event_name  UNIQUE (event_id, name),
    CONSTRAINT chk_teams_desc       CHECK (LENGTH(TRIM(description)) >= 20),
    CONSTRAINT chk_teams_category   CHECK (category IN
        ('WEB', 'MOBILE', 'AI_ML', 'DATA', 'SYSTEMS', 'SECURITY', 'IOT', 'RESEARCH', 'DESIGN', 'OTHER')),
    CONSTRAINT chk_teams_size       CHECK (max_members BETWEEN 2 AND 10),
    CONSTRAINT chk_teams_status     CHECK (status IN ('RECRUITING', 'FULL', 'LOCKED', 'DISBANDED')),
    CONSTRAINT chk_teams_locked_at  CHECK (status <> 'LOCKED' OR locked_at IS NOT NULL)
);

-- Skills a team is looking for (M:N)
CREATE TABLE team_required_skills (
    team_id   INT NOT NULL REFERENCES teams(team_id)   ON DELETE CASCADE,
    skill_id  INT NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
    PRIMARY KEY (team_id, skill_id)
);

-- Membership (M:N users <-> teams) with the member's role in the team
CREATE TABLE team_members (
    team_id      INT          NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id      INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    member_role  VARCHAR(10)  NOT NULL DEFAULT 'MEMBER',
    joined_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id),
    CONSTRAINT chk_team_members_role CHECK (member_role IN ('LEADER', 'MEMBER'))
);
-- exactly one LEADER row per team (partial unique index)
CREATE UNIQUE INDEX uq_team_members_one_leader ON team_members(team_id) WHERE member_role = 'LEADER';

-- ---------------------------------------------------------------------
-- JOIN_REQUESTS: student -> team, verified by leader / faculty
-- ---------------------------------------------------------------------
CREATE TABLE join_requests (
    request_id   SERIAL        PRIMARY KEY,
    team_id      INT           NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    user_id      INT           NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    message      VARCHAR(500),
    match_score  NUMERIC(5,4),
    status       VARCHAR(10)   NOT NULL DEFAULT 'PENDING',
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    decided_at   TIMESTAMPTZ,
    decided_by   INT           REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT chk_jr_status    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')),
    CONSTRAINT chk_jr_score     CHECK (match_score IS NULL OR match_score BETWEEN -1 AND 1),
    -- a decision timestamp exists exactly when the request is no longer pending
    CONSTRAINT chk_jr_decision  CHECK ((status = 'PENDING') = (decided_at IS NULL))
);
-- at most one PENDING request per (team, student)
CREATE UNIQUE INDEX uq_jr_one_pending ON join_requests(team_id, user_id) WHERE status = 'PENDING';

-- ---------------------------------------------------------------------
-- CAPSTONE_PROJECTS: pitches reviewed by faculty
-- ---------------------------------------------------------------------
CREATE TABLE capstone_projects (
    capstone_id   SERIAL        PRIMARY KEY,
    title         VARCHAR(150)  NOT NULL,
    abstract      TEXT          NOT NULL,
    domain        VARCHAR(40)   NOT NULL,
    tech_stack    VARCHAR(255),
    proposer_id   INT           NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    team_id       INT           REFERENCES teams(team_id) ON DELETE SET NULL,
    mentor_id     INT           REFERENCES users(user_id) ON DELETE SET NULL,
    status        VARCHAR(10)   NOT NULL DEFAULT 'SUBMITTED',
    feedback      TEXT,
    submitted_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    reviewed_at   TIMESTAMPTZ,
    reviewed_by   INT           REFERENCES users(user_id) ON DELETE SET NULL,
    CONSTRAINT uq_capstone_title    UNIQUE (title),
    CONSTRAINT uq_capstone_team     UNIQUE (team_id),
    CONSTRAINT chk_capstone_status  CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
    CONSTRAINT chk_capstone_abstract CHECK (LENGTH(abstract) >= 50),
    CONSTRAINT chk_capstone_reviewed CHECK (status NOT IN ('APPROVED', 'REJECTED') OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
    CONSTRAINT chk_capstone_feedback CHECK (status <> 'REJECTED' OR LENGTH(TRIM(COALESCE(feedback, ''))) > 0)
);

-- ---------------------------------------------------------------------
-- TEAM_MESSAGES: peer messaging inside a team
-- ---------------------------------------------------------------------
CREATE TABLE team_messages (
    message_id  SERIAL         PRIMARY KEY,
    team_id     INT            NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    sender_id   INT            NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    body        VARCHAR(1000)  NOT NULL,
    sent_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_team_messages_body CHECK (LENGTH(TRIM(body)) > 0)
);

-- ---------------------------------------------------------------------
-- AUDIT_LOGS: append-only trail, written only by triggers
-- (actor FK has no ON DELETE action: users with history are deactivated, never deleted)
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id      BIGSERIAL     PRIMARY KEY,
    entity      VARCHAR(30)   NOT NULL,
    entity_id   INT           NOT NULL,
    action      VARCHAR(20)   NOT NULL,
    old_value   VARCHAR(30),
    new_value   VARCHAR(30),
    actor_id    INT           REFERENCES users(user_id),
    details     JSONB         NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_audit_action CHECK (action IN ('CREATED', 'STATUS_CHANGE', 'DELETED'))
);

-- ---------------------------------------------------------------------
-- INDEXES on frequently filtered / joined columns
-- ---------------------------------------------------------------------
CREATE INDEX idx_users_role            ON users(role) WHERE is_active;
CREATE INDEX idx_user_skills_skill     ON user_skills(skill_id);
CREATE INDEX idx_past_projects_user    ON past_projects(user_id);
CREATE INDEX idx_events_start          ON events(start_date);
CREATE INDEX idx_events_organizer      ON events(organizer_id);
CREATE INDEX idx_teams_status          ON teams(status);
CREATE INDEX idx_teams_event_status    ON teams(event_id, status);
CREATE INDEX idx_teams_leader          ON teams(leader_id);
CREATE INDEX idx_team_req_skills_skill ON team_required_skills(skill_id);
CREATE INDEX idx_team_members_user     ON team_members(user_id);
CREATE INDEX idx_jr_team_status        ON join_requests(team_id, status);
CREATE INDEX idx_jr_user               ON join_requests(user_id);
CREATE INDEX idx_capstone_status_dom   ON capstone_projects(status, domain);
CREATE INDEX idx_capstone_proposer     ON capstone_projects(proposer_id);
CREATE INDEX idx_messages_team_time    ON team_messages(team_id, sent_at DESC);
CREATE INDEX idx_audit_entity          ON audit_logs(entity, entity_id);
CREATE INDEX idx_audit_created         ON audit_logs(created_at DESC);
