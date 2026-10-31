-- =====================================================================
-- PESU-Sync | 03_functions_triggers.sql
-- Stored functions, stored procedures and triggers that keep the team
-- workflow consistent *inside the database* (not only in the API).
-- Author: P Manas Siddhardha (PES1UG24AM186)
--
-- Error messages start with a code word (TEAM_FULL, TEAM_CLOSED, ...)
-- that the API layer maps to HTTP status codes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: id of the user performing the current transaction.
-- The API sets it with  SELECT set_config('app.user_id', '<id>', true)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_current_actor() RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::INT
$$;

-- Number of members currently in a team
CREATE OR REPLACE FUNCTION fn_team_member_count(p_team_id INT) RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::INT FROM team_members WHERE team_id = p_team_id
$$;

-- Fraction (0..1) of a team's required skills that a student already has.
-- Combined with the vector similarity score to rank match suggestions.
CREATE OR REPLACE FUNCTION fn_skill_overlap(p_user_id INT, p_team_id INT) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND(COUNT(us.skill_id)::NUMERIC / COUNT(*), 4)
           END
      FROM team_required_skills trs
      LEFT JOIN user_skills us
             ON us.skill_id = trs.skill_id AND us.user_id = p_user_id
     WHERE trs.team_id = p_team_id
$$;

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END $$;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------
-- TEAMS: cross-table validation that a CHECK constraint cannot express
--   * leader must be an active STUDENT
--   * max_members cannot exceed the event's max_team_size
--   * max_members cannot drop below the current member count
--   * changing max_members re-evaluates RECRUITING <-> FULL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_team() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_event_max  SMALLINT;
    v_count      INT;
BEGIN
    IF TG_OP = 'INSERT' AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = NEW.leader_id AND role = 'STUDENT' AND is_active) THEN
        RAISE EXCEPTION 'INVALID_LEADER: team leader must be an active student';
    END IF;

    SELECT max_team_size INTO v_event_max FROM events WHERE event_id = NEW.event_id;
    IF NEW.max_members > v_event_max THEN
        RAISE EXCEPTION 'TEAM_TOO_LARGE: this event allows at most % members per team', v_event_max;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.max_members IS DISTINCT FROM OLD.max_members THEN
        v_count := fn_team_member_count(NEW.team_id);
        IF NEW.max_members < v_count THEN
            RAISE EXCEPTION 'INVALID_SIZE: team already has % members', v_count;
        END IF;
        IF NEW.status = 'RECRUITING' AND v_count >= NEW.max_members THEN
            NEW.status := 'FULL';
        ELSIF NEW.status = 'FULL' AND v_count < NEW.max_members THEN
            NEW.status := 'RECRUITING';
        END IF;
    END IF;

    IF NEW.status = 'LOCKED' AND NEW.locked_at IS NULL THEN
        NEW.locked_at := NOW();
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_teams_validate BEFORE INSERT OR UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION fn_validate_team();

-- ---------------------------------------------------------------------
-- TEAM_MEMBERS (before insert): capacity + state + one-team-per-event.
-- The team row is locked FOR UPDATE so two concurrent admissions for
-- the last free slot are serialised (only one can succeed).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_team_capacity() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_team  teams%ROWTYPE;
BEGIN
    SELECT * INTO v_team FROM teams WHERE team_id = NEW.team_id FOR UPDATE;

    IF v_team.status IN ('LOCKED', 'DISBANDED') THEN
        RAISE EXCEPTION 'TEAM_CLOSED: team "%" is % and cannot accept members', v_team.name, v_team.status;
    END IF;

    IF fn_team_member_count(NEW.team_id) >= v_team.max_members THEN
        RAISE EXCEPTION 'TEAM_FULL: team "%" already has % members', v_team.name, v_team.max_members;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM team_members tm
          JOIN teams t ON t.team_id = tm.team_id
         WHERE tm.user_id = NEW.user_id
           AND t.event_id = v_team.event_id
           AND t.status <> 'DISBANDED') THEN
        RAISE EXCEPTION 'ALREADY_IN_TEAM: student % is already in a team for this event', NEW.user_id;
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_team_members_capacity BEFORE INSERT ON team_members
    FOR EACH ROW EXECUTE FUNCTION fn_check_team_capacity();

-- Members cannot leave a LOCKED team (cascade deletes of the team itself are allowed)
CREATE OR REPLACE FUNCTION fn_prevent_leave_locked() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM teams WHERE team_id = OLD.team_id AND status = 'LOCKED') THEN
        RAISE EXCEPTION 'TEAM_CLOSED: members cannot leave a locked team';
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_team_members_leave BEFORE DELETE ON team_members
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_leave_locked();

-- ---------------------------------------------------------------------
-- TEAM_MEMBERS (after insert/delete): auto-update team status
-- RECRUITING -> FULL when capacity is reached, FULL -> RECRUITING when someone leaves.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_team_status() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_team_id INT := COALESCE(NEW.team_id, OLD.team_id);
BEGIN
    UPDATE teams t
       SET status = CASE
                      WHEN t.status = 'RECRUITING' AND fn_team_member_count(t.team_id) >= t.max_members THEN 'FULL'
                      WHEN t.status = 'FULL'       AND fn_team_member_count(t.team_id) <  t.max_members THEN 'RECRUITING'
                      ELSE t.status
                    END
     WHERE t.team_id = v_team_id
       AND t.status IN ('RECRUITING', 'FULL');
    RETURN NULL;
END $$;

CREATE TRIGGER trg_team_members_sync_status AFTER INSERT OR DELETE ON team_members
    FOR EACH ROW EXECUTE FUNCTION fn_sync_team_status();

-- ---------------------------------------------------------------------
-- JOIN_REQUESTS (before insert): only valid requests reach the table
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_join_request() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_team   teams%ROWTYPE;
    v_event  events%ROWTYPE;
BEGIN
    SELECT * INTO v_team  FROM teams  WHERE team_id  = NEW.team_id;
    SELECT * INTO v_event FROM events WHERE event_id = v_team.event_id;

    IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.user_id AND role = 'STUDENT' AND is_active) THEN
        RAISE EXCEPTION 'NOT_STUDENT: only active students can request to join teams';
    END IF;
    IF v_team.status <> 'RECRUITING' THEN
        RAISE EXCEPTION 'TEAM_CLOSED: team "%" is % and not accepting requests', v_team.name, v_team.status;
    END IF;
    IF v_event.registration_deadline < CURRENT_DATE THEN
        RAISE EXCEPTION 'DEADLINE_PASSED: registration for "%" closed on %', v_event.title, v_event.registration_deadline;
    END IF;
    IF EXISTS (SELECT 1 FROM team_members WHERE team_id = NEW.team_id AND user_id = NEW.user_id) THEN
        RAISE EXCEPTION 'ALREADY_MEMBER: you are already a member of this team';
    END IF;
    IF EXISTS (
        SELECT 1 FROM team_members tm JOIN teams t ON t.team_id = tm.team_id
         WHERE tm.user_id = NEW.user_id AND t.event_id = v_team.event_id AND t.status <> 'DISBANDED') THEN
        RAISE EXCEPTION 'ALREADY_IN_TEAM: you are already in a team for this event';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_join_requests_validate BEFORE INSERT ON join_requests
    FOR EACH ROW EXECUTE FUNCTION fn_validate_join_request();

-- ---------------------------------------------------------------------
-- TEAM_MESSAGES: only members of a team may post in it
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_message_sender() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = NEW.team_id AND user_id = NEW.sender_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: only team members can post messages in this team';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_team_messages_sender BEFORE INSERT ON team_messages
    FOR EACH ROW EXECUTE FUNCTION fn_check_message_sender();

-- ---------------------------------------------------------------------
-- CAPSTONE_PROJECTS: mentor must be faculty, reviewer must be faculty/admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_capstone() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.mentor_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = NEW.mentor_id AND role = 'FACULTY') THEN
        RAISE EXCEPTION 'INVALID_MENTOR: mentor must be a faculty member';
    END IF;
    IF NEW.reviewed_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = NEW.reviewed_by AND role IN ('FACULTY', 'ADMIN')) THEN
        RAISE EXCEPTION 'FORBIDDEN: only faculty or admins can review capstones';
    END IF;
    IF NEW.team_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM team_members WHERE team_id = NEW.team_id AND user_id = NEW.proposer_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: the proposer must belong to the linked team';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_capstone_validate BEFORE INSERT OR UPDATE ON capstone_projects
    FOR EACH ROW EXECUTE FUNCTION fn_validate_capstone();

-- ---------------------------------------------------------------------
-- AUDIT TRAIL: generic trigger, TG_ARGV[0] = primary-key column name.
-- Logs creation and every status transition (requested -> verified -> locked/approved).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_status() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_id  INT := (to_jsonb(NEW) ->> TG_ARGV[0])::INT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs(entity, entity_id, action, new_value, actor_id, details)
        VALUES (TG_TABLE_NAME, v_id, 'CREATED', NEW.status, fn_current_actor(),
                jsonb_build_object('row', to_jsonb(NEW) - 'password_hash' - 'search_vector'));
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO audit_logs(entity, entity_id, action, old_value, new_value, actor_id)
        VALUES (TG_TABLE_NAME, v_id, 'STATUS_CHANGE', OLD.status, NEW.status, fn_current_actor());
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_teams AFTER INSERT OR UPDATE OF status ON teams
    FOR EACH ROW EXECUTE FUNCTION fn_audit_status('team_id');
CREATE TRIGGER trg_audit_join_requests AFTER INSERT OR UPDATE OF status ON join_requests
    FOR EACH ROW EXECUTE FUNCTION fn_audit_status('request_id');
CREATE TRIGGER trg_audit_capstones AFTER INSERT OR UPDATE OF status ON capstone_projects
    FOR EACH ROW EXECUTE FUNCTION fn_audit_status('capstone_id');

-- Membership changes are logged too (no status column, so a dedicated function)
CREATE OR REPLACE FUNCTION fn_audit_membership() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs(entity, entity_id, action, new_value, actor_id, details)
        VALUES ('team_members', NEW.team_id, 'CREATED', NEW.member_role, fn_current_actor(),
                jsonb_build_object('user_id', NEW.user_id));
    ELSE
        INSERT INTO audit_logs(entity, entity_id, action, old_value, actor_id, details)
        VALUES ('team_members', OLD.team_id, 'DELETED', OLD.member_role, fn_current_actor(),
                jsonb_build_object('user_id', OLD.user_id));
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_team_members AFTER INSERT OR DELETE ON team_members
    FOR EACH ROW EXECUTE FUNCTION fn_audit_membership();

-- The audit trail is append-only
CREATE OR REPLACE FUNCTION fn_audit_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE: audit_logs is append-only (% not allowed)', TG_OP;
END $$;

CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION fn_audit_immutable();

-- =====================================================================
-- STORED PROCEDURES (called by the API inside a transaction)
-- =====================================================================

-- Accept a join request atomically:
--   lock request + team, authorise actor, add member (capacity trigger),
--   mark request ACCEPTED, withdraw the student's other pending requests
--   in the same event, and auto-reject the queue if the team became FULL.
CREATE OR REPLACE PROCEDURE sp_accept_join_request(p_request_id INT, p_actor_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_req   join_requests%ROWTYPE;
    v_team  teams%ROWTYPE;
BEGIN
    PERFORM set_config('app.user_id', p_actor_id::TEXT, true);

    SELECT * INTO v_req FROM join_requests WHERE request_id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: join request % does not exist', p_request_id;
    END IF;
    IF v_req.status <> 'PENDING' THEN
        RAISE EXCEPTION 'INVALID_STATE: request is already %', v_req.status;
    END IF;

    SELECT * INTO v_team FROM teams WHERE team_id = v_req.team_id FOR UPDATE;
    IF v_team.leader_id <> p_actor_id AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = p_actor_id AND role IN ('FACULTY', 'ADMIN') AND is_active) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the team leader or faculty can verify join requests';
    END IF;

    INSERT INTO team_members(team_id, user_id, member_role)
    VALUES (v_req.team_id, v_req.user_id, 'MEMBER');

    UPDATE join_requests
       SET status = 'ACCEPTED', decided_at = NOW(), decided_by = p_actor_id
     WHERE request_id = p_request_id;

    UPDATE join_requests jr
       SET status = 'WITHDRAWN', decided_at = NOW(), decided_by = p_actor_id
      FROM teams t
     WHERE jr.team_id = t.team_id
       AND t.event_id = v_team.event_id
       AND jr.user_id = v_req.user_id
       AND jr.status = 'PENDING';

    IF (SELECT status FROM teams WHERE team_id = v_req.team_id) = 'FULL' THEN
        UPDATE join_requests
           SET status = 'REJECTED', decided_at = NOW(), decided_by = p_actor_id
         WHERE team_id = v_req.team_id AND status = 'PENDING';
    END IF;
END $$;

-- Lock a team (final roster): needs the event's minimum team size,
-- rejects every request still pending.
CREATE OR REPLACE PROCEDURE sp_lock_team(p_team_id INT, p_actor_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_team    teams%ROWTYPE;
    v_min     SMALLINT;
    v_count   INT;
BEGIN
    PERFORM set_config('app.user_id', p_actor_id::TEXT, true);

    SELECT * INTO v_team FROM teams WHERE team_id = p_team_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: team % does not exist', p_team_id;
    END IF;
    IF v_team.leader_id <> p_actor_id AND NOT EXISTS (
        SELECT 1 FROM users WHERE user_id = p_actor_id AND role IN ('FACULTY', 'ADMIN') AND is_active) THEN
        RAISE EXCEPTION 'FORBIDDEN: only the team leader or faculty can lock a team';
    END IF;
    IF v_team.status NOT IN ('RECRUITING', 'FULL') THEN
        RAISE EXCEPTION 'INVALID_STATE: team is already %', v_team.status;
    END IF;

    SELECT min_team_size INTO v_min FROM events WHERE event_id = v_team.event_id;
    v_count := fn_team_member_count(p_team_id);
    IF v_count < v_min THEN
        RAISE EXCEPTION 'TEAM_TOO_SMALL: event needs at least % members (team has %)', v_min, v_count;
    END IF;

    UPDATE teams SET status = 'LOCKED', locked_at = NOW() WHERE team_id = p_team_id;
    UPDATE join_requests
       SET status = 'REJECTED', decided_at = NOW(), decided_by = p_actor_id
     WHERE team_id = p_team_id AND status = 'PENDING';
END $$;
