-- =====================================================================
-- PESU-Sync | 05_fulltext_search.sql
-- PostgreSQL full-text search on capstone pitches (keyword search),
-- complementing the semantic search done in Qdrant.
-- Author: Parth Pandurang Kale (PES1UG24AM184)
-- =====================================================================

-- Weighted document: title (A) > domain + tech stack (B) > abstract (C).
-- A STORED generated column is kept in sync by PostgreSQL on every INSERT/UPDATE.
ALTER TABLE capstone_projects
    ADD COLUMN search_vector TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(domain, '') || ' ' || COALESCE(tech_stack, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(abstract, '')), 'C')
    ) STORED;

-- GIN (inverted) index so @@ queries do not scan the whole table
CREATE INDEX idx_capstone_search ON capstone_projects USING GIN (search_vector);

-- Ranked keyword search with a highlighted snippet.
-- Matches are wrapped in [[ ]] (rendered safely by the UI, never as raw HTML).
CREATE OR REPLACE FUNCTION fn_search_capstones(p_query TEXT, p_limit INT DEFAULT 20)
RETURNS TABLE (capstone_id INT, rank REAL, snippet TEXT)
LANGUAGE sql STABLE AS $$
    SELECT c.capstone_id,
           ts_rank_cd(c.search_vector, q) AS rank,
           ts_headline('english', c.abstract, q,
                       'StartSel=[[, StopSel=]], MaxWords=35, MinWords=15, MaxFragments=2') AS snippet
      FROM capstone_projects c,
           websearch_to_tsquery('english', p_query) AS q
     WHERE c.search_vector @@ q
     ORDER BY rank DESC, c.capstone_id
     LIMIT p_limit
$$;
