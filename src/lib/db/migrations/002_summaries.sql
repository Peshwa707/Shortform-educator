-- Migration 002: Summaries System
-- Adds multi-level summarization, versioning, and cross-source aggregation

-- ============================================================================
-- Main summaries table with versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('executive', 'key_points', 'detailed', 'segment')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,

  -- Versioning
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_version_id TEXT,

  -- Generation metadata
  generation_model TEXT NOT NULL,
  generation_duration_ms INTEGER,
  input_token_count INTEGER,
  output_token_count INTEGER,

  -- Quality metrics
  quality_score REAL,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Document segments for hierarchical processing
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_segments (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  segment_index INTEGER NOT NULL,
  start_index INTEGER,
  end_index INTEGER,
  section_title TEXT,
  level INTEGER DEFAULT 0,
  estimated_tokens INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, segment_index)
);

-- ============================================================================
-- Cross-source collections
-- ============================================================================
CREATE TABLE IF NOT EXISTS summary_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  collection_type TEXT NOT NULL CHECK (collection_type IN ('topic', 'course', 'custom')),
  aggregated_summary_id TEXT REFERENCES summaries(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Collection membership
-- ============================================================================
CREATE TABLE IF NOT EXISTS collection_sources (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES summary_collections(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  sequence INTEGER,
  weight REAL DEFAULT 1.0,
  UNIQUE(collection_id, source_id)
);

-- ============================================================================
-- Key concepts for deduplication
-- ============================================================================
CREATE TABLE IF NOT EXISTS summary_concepts (
  id TEXT PRIMARY KEY,
  summary_id TEXT REFERENCES summaries(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  concept_normalized TEXT NOT NULL,
  definition TEXT,
  importance_score REAL DEFAULT 0.5
);

-- ============================================================================
-- Export history
-- ============================================================================
CREATE TABLE IF NOT EXISTS summary_exports (
  id TEXT PRIMARY KEY,
  summary_id TEXT REFERENCES summaries(id) ON DELETE CASCADE,
  export_format TEXT NOT NULL CHECK (export_format IN ('markdown', 'pdf', 'anki')),
  file_path TEXT,
  download_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_summaries_source ON summaries(source_id);
CREATE INDEX IF NOT EXISTS idx_summaries_type ON summaries(summary_type);
CREATE INDEX IF NOT EXISTS idx_summaries_current ON summaries(is_current);
CREATE INDEX IF NOT EXISTS idx_document_segments_source ON document_segments(source_id);
CREATE INDEX IF NOT EXISTS idx_collection_sources_collection ON collection_sources(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_sources_source ON collection_sources(source_id);
CREATE INDEX IF NOT EXISTS idx_summary_concepts_summary ON summary_concepts(summary_id);
CREATE INDEX IF NOT EXISTS idx_summary_concepts_normalized ON summary_concepts(concept_normalized);
CREATE INDEX IF NOT EXISTS idx_summary_exports_summary ON summary_exports(summary_id);
