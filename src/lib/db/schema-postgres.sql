-- ADHD Learning Bot Database Schema
-- For PostgreSQL (Railway deployment)

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
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  next_review TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Study progress tracking
CREATE TABLE IF NOT EXISTS progress (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES micro_lessons(id) ON DELETE CASCADE,
  completed_at TIMESTAMP NOT NULL,
  time_spent_seconds INTEGER DEFAULT 0,
  comprehension_rating INTEGER CHECK (comprehension_rating BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Visual summaries (JSON structure for mind maps)
CREATE TABLE IF NOT EXISTS visual_summaries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mindmap', 'hierarchy', 'connections')),
  data TEXT NOT NULL, -- JSON structure
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Flashcard review history (for analytics)
CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id TEXT PRIMARY KEY,
  flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 5),
  reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_to_answer_ms INTEGER
);

-- Daily stats tracking
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY, -- YYYY-MM-DD format
  lessons_completed INTEGER DEFAULT 0,
  cards_reviewed INTEGER DEFAULT 0,
  time_spent_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_micro_lessons_source ON micro_lessons(source_id);
CREATE INDEX IF NOT EXISTS idx_micro_lessons_source_sequence ON micro_lessons(source_id, sequence);
CREATE INDEX IF NOT EXISTS idx_flashcards_lesson ON flashcards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_next_review ON flashcards(next_review);
CREATE INDEX IF NOT EXISTS idx_progress_lesson ON progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_progress_completed_at ON progress(completed_at);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card ON flashcard_reviews(flashcard_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_reviewed_at ON flashcard_reviews(reviewed_at);
CREATE INDEX IF NOT EXISTS idx_sources_processing_status ON sources(processing_status);
