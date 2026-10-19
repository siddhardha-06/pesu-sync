-- =====================================================================
-- PESU-Sync | 06_campus_events.sql
-- Cache of events published on pes.edu (public REST API of The Events
-- Calendar). Refreshed by the API layer with an idempotent UPSERT, so the
-- page keeps working when pes.edu is slow or down.
-- Author: Parth Pandurang Kale (PES1UG24AM184)
-- =====================================================================

DROP TABLE IF EXISTS campus_event_syncs, campus_events;

CREATE TABLE campus_events (
    campus_event_id  SERIAL        PRIMARY KEY,
    source           VARCHAR(20)   NOT NULL DEFAULT 'pes.edu',
    source_id        VARCHAR(40)   NOT NULL,
    title            VARCHAR(255)  NOT NULL,
    starts_at        TIMESTAMPTZ   NOT NULL,
    ends_at          TIMESTAMPTZ,
    all_day          BOOLEAN       NOT NULL DEFAULT FALSE,
    venue            VARCHAR(255),
    url              VARCHAR(500)  NOT NULL,
    summary          TEXT,
    fetched_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_campus_events_source UNIQUE (source, source_id),
    CONSTRAINT chk_campus_events_url   CHECK (url ~ '^https?://'),
    CONSTRAINT chk_campus_events_time  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_campus_events_starts ON campus_events(starts_at);

-- One row per refresh attempt: lets the app decide when to refetch and show
-- when the data was last confirmed (and why a refresh failed)
CREATE TABLE campus_event_syncs (
    sync_id     SERIAL       PRIMARY KEY,
    source      VARCHAR(20)  NOT NULL DEFAULT 'pes.edu',
    synced_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    fetched     INT          NOT NULL DEFAULT 0 CHECK (fetched >= 0),
    ok          BOOLEAN      NOT NULL,
    error       TEXT,
    CONSTRAINT chk_campus_syncs_error CHECK (ok OR error IS NOT NULL)
);
CREATE INDEX idx_campus_syncs_latest ON campus_event_syncs(source, synced_at DESC);
