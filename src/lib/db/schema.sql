-- ADHD Learning Bot Database Schema
-- For Cloudflare D1 (SQLite)

-- Content sources (uploaded files, URLs)
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'youtube', 'audio', 'text')),
  title TEXT NOT NULL,
  original_url TEXT,
  file_path TEXT,
  raw_text TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'extracting', 'chunking', 'generating_cards', 'generating_audio', 'complete', 'error')),
  processing_progress INTEGER DEFAULT 0,
  error_message TEXT,
  processed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Micro-lessons generated from sources
CREATE TABLE IF NOT EXISTS micro_lessons (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  title TEXT NOT NULL,
  hook TEXT,
  content TEXT NOT NULL,
  key_takeaway TEXT,
  estimated_minutes INTEGER DEFAULT 3,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty IN (1, 2, 3)),
  audio_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, sequence)
);

-- Flashcards with spaced repetition (SM-2)
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES micro_lessons(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  hint TEXT,
  mnemonic TEXT,
  visual_cue TEXT,
  -- SM-2 algorithm fields
  ease_factor REAL DEFAULT 2.5,
  interval INTEGER DEFAULT 0,
  repetitions INTEGER DEFAULT 0,
  next_review DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Study progress tracking
CREATE TABLE IF NOT EXISTS progress (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES micro_lessons(id) ON DELETE CASCADE,
  completed_at DATETIME NOT NULL,
  time_spent_seconds INTEGER DEFAULT 0,
  comprehension_rating INTEGER CHECK (comprehension_rating BETWEEN 1 AND 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Visual summaries (JSON structure for mind maps)
CREATE TABLE IF NOT EXISTS visual_summaries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mindmap', 'hierarchy', 'connections')),
  data TEXT NOT NULL, -- JSON structure
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Flashcard review history (for analytics)
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id TEXT PRIMARY KEY,
  flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 5),
  reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  time_to_answer_ms INTEGER
);

-- Daily stats tracking
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY, -- YYYY-MM-DD format
  lessons_completed INTEGER DEFAULT 0,
  cards_reviewed INTEGER DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_micro_lessons_source ON micro_lessons(source_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_lesson ON flashcards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_next_review ON flashcards(next_review);
CREATE INDEX IF NOT EXISTS idx_progress_lesson ON progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(flashcard_id);

-- ============================================================================
-- Summarization System Tables
-- ============================================================================

-- Main summaries table with versioning
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('executive', 'key_points', 'detailed', 'segment')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  version INTEGER DEFAULT 1,
  is_current BOOLEAN DEFAULT true,
  parent_version_id TEXT,
  generation_model TEXT NOT NULL,
  generation_duration_ms INTEGER,
  input_token_count INTEGER,
  output_token_count INTEGER,
  quality_score REAL,
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Document segments for hierarchical processing
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

-- Cross-source collections
CREATE TABLE IF NOT EXISTS summary_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  collection_type TEXT NOT NULL CHECK (collection_type IN ('topic', 'course', 'custom')),
  aggregated_summary_id TEXT REFERENCES summaries(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Collection membership
CREATE TABLE IF NOT EXISTS collection_sources (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES summary_collections(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
  sequence INTEGER,
  weight REAL DEFAULT 1.0,
  UNIQUE(collection_id, source_id)
);

-- Key concepts for deduplication
CREATE TABLE IF NOT EXISTS summary_concepts (
  id TEXT PRIMARY KEY,
  summary_id TEXT REFERENCES summaries(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  concept_normalized TEXT NOT NULL,
  definition TEXT,
  importance_score REAL DEFAULT 0.5
);

-- Export history
CREATE TABLE IF NOT EXISTS summary_exports (
  id TEXT PRIMARY KEY,
  summary_id TEXT REFERENCES summaries(id) ON DELETE CASCADE,
  export_format TEXT NOT NULL CHECK (export_format IN ('markdown', 'pdf', 'anki')),
  file_path TEXT,
  download_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Summarization indexes
CREATE INDEX IF NOT EXISTS idx_summaries_source ON summaries(source_id);
CREATE INDEX IF NOT EXISTS idx_summaries_type ON summaries(summary_type);
CREATE INDEX IF NOT EXISTS idx_summaries_current ON summaries(is_current);
-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_summaries_source_type_current ON summaries(source_id, summary_type, is_current);
CREATE INDEX IF NOT EXISTS idx_summaries_source_type_version ON summaries(source_id, summary_type, version);
CREATE INDEX IF NOT EXISTS idx_document_segments_source ON document_segments(source_id);
CREATE INDEX IF NOT EXISTS idx_collection_sources_collection ON collection_sources(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_sources_source ON collection_sources(source_id);
CREATE INDEX IF NOT EXISTS idx_summary_concepts_summary ON summary_concepts(summary_id);
CREATE INDEX IF NOT EXISTS idx_summary_concepts_normalized ON summary_concepts(concept_normalized);
CREATE INDEX IF NOT EXISTS idx_summary_exports_summary ON summary_exports(summary_id);
