// Database client - supports both SQLite (local) and PostgreSQL (production)
// Uses SQLite when DATABASE_URL is not set, PostgreSQL when it is

import { Source, MicroLesson, Flashcard, Progress, SourceType } from '@/types';
import {
  Summary,
  SummaryType,
  DocumentSegment,
  SummaryCollection,
  CollectionType,
  CollectionSource,
  SummaryConcept,
  SummaryExport,
  ExportFormat,
  CreateSummaryInput,
  CreateDocumentSegmentInput,
  CreateCollectionInput,
  CreateCollectionSourceInput,
  CreateConceptInput,
  CreateExportInput,
  UpdateSummaryInput,
} from '@/types/summaries';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';
import { POSTGRES_SCHEMA } from './schema-embedded';

// Detect which database to use
const usePostgres = !!process.env.DATABASE_URL;

// ============================================================================
// PostgreSQL Setup (when DATABASE_URL is set)
// ============================================================================
import postgres from 'postgres';

const sql = usePostgres
  ? postgres(process.env.DATABASE_URL!, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : null;

// ============================================================================
// SQLite Setup (local development fallback)
// ============================================================================
import initSqlJs, { Database as SqlJsDatabase, BindParams } from 'sql.js';

const DB_PATH = path.join(process.cwd(), 'data', 'learning.db');
let sqliteDb: SqlJsDatabase | null = null;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

function ensureDataDir() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

async function initSQLite() {
  if (!SQL) {
    const wasmPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });
  }
  return SQL;
}

function saveSqliteDb() {
  if (sqliteDb) {
    ensureDataDir();
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// ============================================================================
// Initialization
// ============================================================================
let schemaInitialized = false;

export async function initializeDb(): Promise<void> {
  if (schemaInitialized) return;

  if (usePostgres) {
    // PostgreSQL initialization - use embedded schema to avoid filesystem access in production
    const statements = POSTGRES_SCHEMA.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const statement of statements) {
      await sql!.unsafe(statement);
    }
  } else {
    // SQLite initialization
    ensureDataDir();
    const SqlJs = await initSQLite();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      sqliteDb = new SqlJs.Database(buffer);
    } else {
      sqliteDb = new SqlJs.Database();
    }
    const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    sqliteDb.run(schema);
    saveSqliteDb();
  }

  schemaInitialized = true;
}

export async function getDbAsync(): Promise<unknown> {
  await initializeDb();
  return usePostgres ? sql : sqliteDb;
}

// ============================================================================
// Helper for direct queries
// ============================================================================
export async function getOne<T extends Record<string, unknown>>(
  query: string,
  params: unknown[] = []
): Promise<T | undefined> {
  await initializeDb();

  if (usePostgres) {
    const result = await sql!.unsafe<T[]>(query, params as postgres.ParameterOrJSON<never>[]);
    return result[0];
  } else {
    const stmt = sqliteDb!.prepare(query);
    stmt.bind(params as BindParams);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row as T;
    }
    stmt.free();
    return undefined;
  }
}

// SQLite helpers
function sqliteGetAll(query: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = sqliteDb!.prepare(query);
  stmt.bind(params as BindParams);
  const rows: Record<string, unknown>[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return rows;
}

function sqliteRun(query: string, params: unknown[] = []) {
  sqliteDb!.run(query, params as BindParams);
  saveSqliteDb();
}

// ============================================================================
// Source operations
// ============================================================================

export async function createSource(data: {
  type: SourceType;
  title: string;
  originalUrl?: string;
  filePath?: string;
  rawText?: string;
}): Promise<Source> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      INSERT INTO sources (id, type, title, original_url, file_path, raw_text, created_at)
      VALUES (${id}, ${data.type}, ${data.title}, ${data.originalUrl || null}, ${data.filePath || null}, ${data.rawText || null}, ${now})
    `;
  } else {
    sqliteRun(
      `INSERT INTO sources (id, type, title, original_url, file_path, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.type, data.title, data.originalUrl || null, data.filePath || null, data.rawText || null, now]
    );
  }

  return {
    id,
    type: data.type,
    title: data.title,
    originalUrl: data.originalUrl,
    filePath: data.filePath,
    rawText: data.rawText,
    createdAt: new Date(now),
  };
}

export async function getSource(id: string): Promise<Source | null> {
  await initializeDb();

  const query = `
    SELECT s.*,
           COUNT(DISTINCT ml.id) as lesson_count,
           COUNT(DISTINCT f.id) as card_count
    FROM sources s
    LEFT JOIN micro_lessons ml ON ml.source_id = s.id
    LEFT JOIN flashcards f ON f.lesson_id = ml.id
    WHERE s.id = ${usePostgres ? '$1' : '?'}
    GROUP BY s.id
  `;

  if (usePostgres) {
    const rows = await sql!`
      SELECT s.*,
             COUNT(DISTINCT ml.id) as lesson_count,
             COUNT(DISTINCT f.id) as card_count
      FROM sources s
      LEFT JOIN micro_lessons ml ON ml.source_id = s.id
      LEFT JOIN flashcards f ON f.lesson_id = ml.id
      WHERE s.id = ${id}
      GROUP BY s.id
    `;
    if (rows.length === 0) return null;
    return rowToSource(rows[0] as Record<string, unknown>);
  } else {
    const rows = sqliteGetAll(
      `SELECT s.*, COUNT(DISTINCT ml.id) as lesson_count, COUNT(DISTINCT f.id) as card_count
       FROM sources s
       LEFT JOIN micro_lessons ml ON ml.source_id = s.id
       LEFT JOIN flashcards f ON f.lesson_id = ml.id
       WHERE s.id = ?
       GROUP BY s.id`,
      [id]
    );
    if (rows.length === 0) return null;
    return rowToSource(rows[0]);
  }
}

export async function getSourceWithText(id: string): Promise<Source | null> {
  return getSource(id);
}

export async function getAllSources(): Promise<Source[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT
        s.id, s.type, s.title, s.original_url, s.file_path,
        s.processing_status, s.processing_progress, s.error_message,
        s.processed_at, s.created_at,
        COUNT(DISTINCT ml.id) as lesson_count,
        COUNT(DISTINCT f.id) as card_count
      FROM sources s
      LEFT JOIN micro_lessons ml ON ml.source_id = s.id
      LEFT JOIN flashcards f ON f.lesson_id = ml.id
      GROUP BY s.id, s.type, s.title, s.original_url, s.file_path,
               s.processing_status, s.processing_progress, s.error_message,
               s.processed_at, s.created_at
      ORDER BY s.created_at DESC
    `;
    return rows.map((row) => rowToSource(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT s.*, COUNT(DISTINCT ml.id) as lesson_count, COUNT(DISTINCT f.id) as card_count
       FROM sources s
       LEFT JOIN micro_lessons ml ON ml.source_id = s.id
       LEFT JOIN flashcards f ON f.lesson_id = ml.id
       GROUP BY s.id
       ORDER BY s.created_at DESC`
    );
    return rows.map(rowToSource);
  }
}

export async function updateSourceStatus(
  id: string,
  status: string,
  progress: number,
  errorMessage?: string
): Promise<void> {
  await initializeDb();
  const processedAt = status === 'complete' ? new Date().toISOString() : null;

  if (usePostgres) {
    await sql!`
      UPDATE sources
      SET processing_status = ${status},
          processing_progress = ${progress},
          error_message = ${errorMessage || null},
          processed_at = ${processedAt}
      WHERE id = ${id}
    `;
  } else {
    sqliteRun(
      `UPDATE sources SET processing_status = ?, processing_progress = ?, error_message = ?, processed_at = ? WHERE id = ?`,
      [status, progress, errorMessage || null, processedAt, id]
    );
  }
}

export async function updateSourceRawText(id: string, rawText: string): Promise<void> {
  await initializeDb();
  if (usePostgres) {
    await sql!`UPDATE sources SET raw_text = ${rawText} WHERE id = ${id}`;
  } else {
    sqliteRun(`UPDATE sources SET raw_text = ? WHERE id = ?`, [rawText, id]);
  }
}

export async function deleteSource(id: string): Promise<void> {
  await initializeDb();
  if (usePostgres) {
    await sql!`DELETE FROM sources WHERE id = ${id}`;
  } else {
    sqliteRun(`DELETE FROM sources WHERE id = ?`, [id]);
  }
}

// ============================================================================
// Micro-lesson operations
// ============================================================================

export async function createMicroLesson(data: Omit<MicroLesson, 'id' | 'createdAt'>): Promise<MicroLesson> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      INSERT INTO micro_lessons (id, source_id, sequence, title, hook, content, key_takeaway, estimated_minutes, difficulty, audio_path, created_at)
      VALUES (${id}, ${data.sourceId}, ${data.sequence}, ${data.title}, ${data.hook}, ${data.content}, ${data.keyTakeaway}, ${data.estimatedMinutes}, ${data.difficulty}, ${data.audioPath || null}, ${now})
    `;
  } else {
    sqliteRun(
      `INSERT INTO micro_lessons (id, source_id, sequence, title, hook, content, key_takeaway, estimated_minutes, difficulty, audio_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.sourceId, data.sequence, data.title, data.hook, data.content, data.keyTakeaway, data.estimatedMinutes, data.difficulty, data.audioPath || null, now]
    );
  }

  return { id, ...data, createdAt: new Date(now) };
}

export async function createMicroLessons(lessons: Omit<MicroLesson, 'id' | 'createdAt'>[]): Promise<MicroLesson[]> {
  await initializeDb();
  if (lessons.length === 0) return [];

  const now = new Date().toISOString();
  const results: MicroLesson[] = [];

  if (usePostgres) {
    await sql!.begin(async (tx: postgres.TransactionSql) => {
      for (const lesson of lessons) {
        const id = nanoid();
        await tx.unsafe(
          `INSERT INTO micro_lessons (id, source_id, sequence, title, hook, content, key_takeaway, estimated_minutes, difficulty, audio_path, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [id, lesson.sourceId, lesson.sequence, lesson.title, lesson.hook, lesson.content, lesson.keyTakeaway, lesson.estimatedMinutes, lesson.difficulty, lesson.audioPath || null, now]
        );
        results.push({ id, ...lesson, createdAt: new Date(now) });
      }
    });
  } else {
    for (const lesson of lessons) {
      const id = nanoid();
      sqliteDb!.run(
        `INSERT INTO micro_lessons (id, source_id, sequence, title, hook, content, key_takeaway, estimated_minutes, difficulty, audio_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, lesson.sourceId, lesson.sequence, lesson.title, lesson.hook, lesson.content, lesson.keyTakeaway, lesson.estimatedMinutes, lesson.difficulty, lesson.audioPath || null, now]
      );
      results.push({ id, ...lesson, createdAt: new Date(now) });
    }
    saveSqliteDb();
  }

  return results;
}

export async function getMicroLessons(sourceId: string): Promise<MicroLesson[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT ml.*,
             CASE WHEN p.id IS NOT NULL THEN true ELSE false END as is_completed
      FROM micro_lessons ml
      LEFT JOIN progress p ON p.lesson_id = ml.id
      WHERE ml.source_id = ${sourceId}
      ORDER BY ml.sequence ASC
    `;
    return rows.map((row) => rowToMicroLesson(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT ml.*, CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as is_completed
       FROM micro_lessons ml
       LEFT JOIN progress p ON p.lesson_id = ml.id
       WHERE ml.source_id = ?
       ORDER BY ml.sequence ASC`,
      [sourceId]
    );
    return rows.map(rowToMicroLesson);
  }
}

export async function getMicroLesson(id: string): Promise<MicroLesson | null> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT ml.*,
             CASE WHEN p.id IS NOT NULL THEN true ELSE false END as is_completed
      FROM micro_lessons ml
      LEFT JOIN progress p ON p.lesson_id = ml.id
      WHERE ml.id = ${id}
    `;
    if (rows.length === 0) return null;
    return rowToMicroLesson(rows[0] as Record<string, unknown>);
  } else {
    const rows = sqliteGetAll(
      `SELECT ml.*, CASE WHEN p.id IS NOT NULL THEN 1 ELSE 0 END as is_completed
       FROM micro_lessons ml
       LEFT JOIN progress p ON p.lesson_id = ml.id
       WHERE ml.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;
    return rowToMicroLesson(rows[0]);
  }
}

// ============================================================================
// Flashcard operations
// ============================================================================

export async function createFlashcard(data: Omit<Flashcard, 'id' | 'createdAt'>): Promise<Flashcard> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      INSERT INTO flashcards (id, lesson_id, front, back, hint, mnemonic, visual_cue, ease_factor, interval, repetitions, next_review, created_at)
      VALUES (${id}, ${data.lessonId}, ${data.front}, ${data.back}, ${data.hint || null}, ${data.mnemonic || null}, ${data.visualCue || null}, ${data.easeFactor}, ${data.interval}, ${data.repetitions}, ${data.nextReview?.toISOString() || now}, ${now})
    `;
  } else {
    sqliteRun(
      `INSERT INTO flashcards (id, lesson_id, front, back, hint, mnemonic, visual_cue, ease_factor, interval, repetitions, next_review, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.lessonId, data.front, data.back, data.hint || null, data.mnemonic || null, data.visualCue || null, data.easeFactor, data.interval, data.repetitions, data.nextReview?.toISOString() || now, now]
    );
  }

  return { id, ...data, createdAt: new Date(now) };
}

export async function createFlashcards(cards: Omit<Flashcard, 'id' | 'createdAt'>[]): Promise<Flashcard[]> {
  await initializeDb();
  if (cards.length === 0) return [];

  const now = new Date().toISOString();
  const results: Flashcard[] = [];

  if (usePostgres) {
    await sql!.begin(async (tx: postgres.TransactionSql) => {
      for (const card of cards) {
        const id = nanoid();
        await tx.unsafe(
          `INSERT INTO flashcards (id, lesson_id, front, back, hint, mnemonic, visual_cue, ease_factor, interval, repetitions, next_review, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [id, card.lessonId, card.front, card.back, card.hint || null, card.mnemonic || null, card.visualCue || null, card.easeFactor, card.interval, card.repetitions, card.nextReview?.toISOString() || now, now]
        );
        results.push({ id, ...card, createdAt: new Date(now) });
      }
    });
  } else {
    for (const card of cards) {
      const id = nanoid();
      sqliteDb!.run(
        `INSERT INTO flashcards (id, lesson_id, front, back, hint, mnemonic, visual_cue, ease_factor, interval, repetitions, next_review, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, card.lessonId, card.front, card.back, card.hint || null, card.mnemonic || null, card.visualCue || null, card.easeFactor, card.interval, card.repetitions, card.nextReview?.toISOString() || now, now]
      );
      results.push({ id, ...card, createdAt: new Date(now) });
    }
    saveSqliteDb();
  }

  return results;
}

export async function getFlashcardsByLesson(lessonId: string): Promise<Flashcard[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`SELECT * FROM flashcards WHERE lesson_id = ${lessonId} ORDER BY created_at ASC`;
    return rows.map((row) => rowToFlashcard(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(`SELECT * FROM flashcards WHERE lesson_id = ? ORDER BY created_at ASC`, [lessonId]);
    return rows.map(rowToFlashcard);
  }
}

export async function getFlashcardsBySource(sourceId: string): Promise<Flashcard[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT f.* FROM flashcards f
      JOIN micro_lessons ml ON f.lesson_id = ml.id
      WHERE ml.source_id = ${sourceId}
      ORDER BY f.created_at ASC
    `;
    return rows.map((row) => rowToFlashcard(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT f.* FROM flashcards f
       JOIN micro_lessons ml ON f.lesson_id = ml.id
       WHERE ml.source_id = ?
       ORDER BY f.created_at ASC`,
      [sourceId]
    );
    return rows.map(rowToFlashcard);
  }
}

export async function getDueFlashcards(limit: number = 20): Promise<Flashcard[]> {
  await initializeDb();
  const now = new Date().toISOString();

  if (usePostgres) {
    const rows = await sql!`
      SELECT * FROM flashcards
      WHERE next_review <= ${now}
      ORDER BY next_review ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => rowToFlashcard(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT * FROM flashcards WHERE next_review <= ? ORDER BY next_review ASC LIMIT ?`,
      [now, limit]
    );
    return rows.map(rowToFlashcard);
  }
}

export async function getFlashcard(id: string): Promise<Flashcard | null> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`SELECT * FROM flashcards WHERE id = ${id}`;
    if (rows.length === 0) return null;
    return rowToFlashcard(rows[0] as Record<string, unknown>);
  } else {
    const rows = sqliteGetAll(`SELECT * FROM flashcards WHERE id = ?`, [id]);
    if (rows.length === 0) return null;
    return rowToFlashcard(rows[0]);
  }
}

export async function updateFlashcardAfterReview(
  id: string,
  easeFactor: number,
  interval: number,
  repetitions: number,
  nextReview: Date
): Promise<void> {
  await initializeDb();

  if (usePostgres) {
    await sql!`
      UPDATE flashcards
      SET ease_factor = ${easeFactor},
          interval = ${interval},
          repetitions = ${repetitions},
          next_review = ${nextReview.toISOString()}
      WHERE id = ${id}
    `;
  } else {
    sqliteRun(
      `UPDATE flashcards SET ease_factor = ?, interval = ?, repetitions = ?, next_review = ? WHERE id = ?`,
      [easeFactor, interval, repetitions, nextReview.toISOString(), id]
    );
  }
}

// ============================================================================
// Progress operations
// ============================================================================

export async function markLessonComplete(
  lessonId: string,
  timeSpentSeconds: number,
  comprehensionRating: 1 | 2 | 3 | 4 | 5
): Promise<Progress> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      INSERT INTO progress (id, lesson_id, completed_at, time_spent_seconds, comprehension_rating)
      VALUES (${id}, ${lessonId}, ${now}, ${timeSpentSeconds}, ${comprehensionRating})
    `;
  } else {
    sqliteRun(
      `INSERT INTO progress (id, lesson_id, completed_at, time_spent_seconds, comprehension_rating) VALUES (?, ?, ?, ?, ?)`,
      [id, lessonId, now, timeSpentSeconds, comprehensionRating]
    );
  }

  return { id, lessonId, completedAt: new Date(now), timeSpentSeconds, comprehensionRating };
}

export async function recordFlashcardReview(flashcardId: string, rating: number, timeToAnswerMs: number): Promise<void> {
  await initializeDb();
  const id = nanoid();

  if (usePostgres) {
    await sql!`
      INSERT INTO flashcard_reviews (id, flashcard_id, rating, time_to_answer_ms)
      VALUES (${id}, ${flashcardId}, ${rating}, ${timeToAnswerMs})
    `;
  } else {
    sqliteRun(
      `INSERT INTO flashcard_reviews (id, flashcard_id, rating, time_to_answer_ms) VALUES (?, ?, ?, ?)`,
      [id, flashcardId, rating, timeToAnswerMs]
    );
  }
}

// ============================================================================
// Stats
// ============================================================================

export async function getStats(): Promise<{
  totalSources: number;
  totalLessons: number;
  completedLessons: number;
  totalCards: number;
  cardsReviewedToday: number;
  currentStreak: number;
  longestStreak: number;
}> {
  await initializeDb();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.toISOString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayEnd = tomorrow.toISOString();

  if (usePostgres) {
    const rows = await sql!`
      SELECT
        (SELECT COUNT(*) FROM sources) as total_sources,
        (SELECT COUNT(*) FROM micro_lessons) as total_lessons,
        (SELECT COUNT(DISTINCT lesson_id) FROM progress) as completed_lessons,
        (SELECT COUNT(*) FROM flashcards) as total_cards,
        (SELECT COUNT(*) FROM flashcard_reviews WHERE reviewed_at >= ${todayStart} AND reviewed_at < ${todayEnd}) as cards_reviewed_today
    `;
    const stats = rows[0] || {};
    return {
      totalSources: Number(stats.total_sources) || 0,
      totalLessons: Number(stats.total_lessons) || 0,
      completedLessons: Number(stats.completed_lessons) || 0,
      totalCards: Number(stats.total_cards) || 0,
      cardsReviewedToday: Number(stats.cards_reviewed_today) || 0,
      currentStreak: 0,
      longestStreak: 0,
    };
  } else {
    const todayDate = today.toISOString().split('T')[0];
    const rows = sqliteGetAll(`
      SELECT
        (SELECT COUNT(*) FROM sources) as total_sources,
        (SELECT COUNT(*) FROM micro_lessons) as total_lessons,
        (SELECT COUNT(DISTINCT lesson_id) FROM progress) as completed_lessons,
        (SELECT COUNT(*) FROM flashcards) as total_cards,
        (SELECT COUNT(*) FROM flashcard_reviews WHERE date(reviewed_at) = ?) as cards_reviewed_today
    `, [todayDate]);
    const stats = rows[0] || {};
    return {
      totalSources: Number(stats.total_sources) || 0,
      totalLessons: Number(stats.total_lessons) || 0,
      completedLessons: Number(stats.completed_lessons) || 0,
      totalCards: Number(stats.total_cards) || 0,
      cardsReviewedToday: Number(stats.cards_reviewed_today) || 0,
      currentStreak: 0,
      longestStreak: 0,
    };
  }
}

// ============================================================================
// Summary operations
// ============================================================================

export async function createSummary(data: CreateSummaryInput): Promise<Summary> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  // Calculate next version number
  let nextVersion = 1;
  if (usePostgres) {
    const versionResult = await sql!`
      SELECT COALESCE(MAX(version), 0) + 1 as next_version
      FROM summaries
      WHERE source_id = ${data.sourceId} AND summary_type = ${data.summaryType}
    `;
    nextVersion = versionResult[0]?.next_version || 1;

    // Mark previous versions as not current (fix race condition)
    await sql!`
      UPDATE summaries
      SET is_current = false, updated_at = ${now}
      WHERE source_id = ${data.sourceId}
        AND summary_type = ${data.summaryType}
        AND is_current = true
    `;

    await sql!`
      INSERT INTO summaries (
        id, source_id, summary_type, title, content, word_count,
        version, is_current, parent_version_id,
        generation_model, generation_duration_ms, input_token_count, output_token_count,
        quality_score, user_rating, created_at, updated_at
      ) VALUES (
        ${id}, ${data.sourceId}, ${data.summaryType}, ${data.title}, ${data.content}, ${data.wordCount},
        ${nextVersion}, true, ${data.parentVersionId || null},
        ${data.generationModel}, ${data.generationDurationMs || null}, ${data.inputTokenCount || null}, ${data.outputTokenCount || null},
        ${data.qualityScore || null}, ${data.userRating || null}, ${now}, ${now}
      )
    `;
  } else {
    const versionRow = sqliteGetAll(
      `SELECT COALESCE(MAX(version), 0) + 1 as next_version
       FROM summaries
       WHERE source_id = ? AND summary_type = ?`,
      [data.sourceId, data.summaryType]
    );
    nextVersion = (versionRow[0] as Record<string, unknown>)?.next_version as number || 1;

    // Mark previous versions as not current (fix race condition)
    sqliteRun(
      `UPDATE summaries
       SET is_current = 0, updated_at = ?
       WHERE source_id = ? AND summary_type = ? AND is_current = 1`,
      [now, data.sourceId, data.summaryType]
    );

    sqliteRun(
      `INSERT INTO summaries (
        id, source_id, summary_type, title, content, word_count,
        version, is_current, parent_version_id,
        generation_model, generation_duration_ms, input_token_count, output_token_count,
        quality_score, user_rating, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.sourceId, data.summaryType, data.title, data.content, data.wordCount,
        nextVersion, data.parentVersionId || null,
        data.generationModel, data.generationDurationMs || null, data.inputTokenCount || null, data.outputTokenCount || null,
        data.qualityScore || null, data.userRating || null, now, now
      ]
    );
  }

  return {
    id,
    sourceId: data.sourceId,
    summaryType: data.summaryType,
    title: data.title,
    content: data.content,
    wordCount: data.wordCount,
    version: nextVersion,
    isCurrent: true,
    parentVersionId: data.parentVersionId,
    generationModel: data.generationModel,
    generationDurationMs: data.generationDurationMs,
    inputTokenCount: data.inputTokenCount,
    outputTokenCount: data.outputTokenCount,
    qualityScore: data.qualityScore,
    userRating: data.userRating,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export async function createSummaries(summaries: CreateSummaryInput[]): Promise<Summary[]> {
  await initializeDb();
  if (summaries.length === 0) return [];

  const now = new Date().toISOString();
  const results: Summary[] = [];

  // Collect unique sourceId/summaryType pairs to calculate versions
  const versionMap = new Map<string, number>();

  if (usePostgres) {
    await sql!.begin(async (tx: postgres.TransactionSql) => {
      for (const data of summaries) {
        const versionKey = `${data.sourceId}:${data.summaryType}`;
        let nextVersion: number;

        // Check if we already calculated version for this pair in this batch
        if (versionMap.has(versionKey)) {
          nextVersion = versionMap.get(versionKey)!;
        } else {
          // Calculate next version number
          const versionResult = await tx.unsafe(
            `SELECT COALESCE(MAX(version), 0) + 1 as next_version
             FROM summaries
             WHERE source_id = $1 AND summary_type = $2`,
            [data.sourceId, data.summaryType]
          );
          nextVersion = Number(versionResult[0]?.next_version) || 1;

          // Mark previous versions as not current
          await tx.unsafe(
            `UPDATE summaries
             SET is_current = false, updated_at = $1
             WHERE source_id = $2 AND summary_type = $3 AND is_current = true`,
            [now, data.sourceId, data.summaryType]
          );

          versionMap.set(versionKey, nextVersion);
        }

        const id = nanoid();
        await tx.unsafe(
          `INSERT INTO summaries (
            id, source_id, summary_type, title, content, word_count,
            version, is_current, parent_version_id,
            generation_model, generation_duration_ms, input_token_count, output_token_count,
            quality_score, user_rating, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            id, data.sourceId, data.summaryType, data.title, data.content, data.wordCount,
            nextVersion,
            data.parentVersionId || null,
            data.generationModel, data.generationDurationMs || null, data.inputTokenCount || null, data.outputTokenCount || null,
            data.qualityScore || null, data.userRating || null, now, now
          ]
        );
        results.push({
          id,
          sourceId: data.sourceId,
          summaryType: data.summaryType,
          title: data.title,
          content: data.content,
          wordCount: data.wordCount,
          version: nextVersion,
          isCurrent: true,
          parentVersionId: data.parentVersionId,
          generationModel: data.generationModel,
          generationDurationMs: data.generationDurationMs,
          inputTokenCount: data.inputTokenCount,
          outputTokenCount: data.outputTokenCount,
          qualityScore: data.qualityScore,
          userRating: data.userRating,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        });
      }
    });
  } else {
    for (const data of summaries) {
      const versionKey = `${data.sourceId}:${data.summaryType}`;
      let nextVersion: number;

      // Check if we already calculated version for this pair in this batch
      if (versionMap.has(versionKey)) {
        nextVersion = versionMap.get(versionKey)!;
      } else {
        // Calculate next version number
        const versionRows = sqliteGetAll(
          `SELECT COALESCE(MAX(version), 0) + 1 as next_version
           FROM summaries
           WHERE source_id = ? AND summary_type = ?`,
          [data.sourceId, data.summaryType]
        );
        nextVersion = Number(versionRows[0]?.next_version) || 1;

        // Mark previous versions as not current
        sqliteDb!.run(
          `UPDATE summaries
           SET is_current = 0, updated_at = ?
           WHERE source_id = ? AND summary_type = ? AND is_current = 1`,
          [now, data.sourceId, data.summaryType]
        );

        versionMap.set(versionKey, nextVersion);
      }

      const id = nanoid();
      sqliteDb!.run(
        `INSERT INTO summaries (
          id, source_id, summary_type, title, content, word_count,
          version, is_current, parent_version_id,
          generation_model, generation_duration_ms, input_token_count, output_token_count,
          quality_score, user_rating, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, data.sourceId, data.summaryType, data.title, data.content, data.wordCount,
          nextVersion,
          data.parentVersionId || null,
          data.generationModel, data.generationDurationMs || null, data.inputTokenCount || null, data.outputTokenCount || null,
          data.qualityScore || null, data.userRating || null, now, now
        ]
      );
      results.push({
        id,
        sourceId: data.sourceId,
        summaryType: data.summaryType,
        title: data.title,
        content: data.content,
        wordCount: data.wordCount,
        version: nextVersion,
        isCurrent: true,
        parentVersionId: data.parentVersionId,
        generationModel: data.generationModel,
        generationDurationMs: data.generationDurationMs,
        inputTokenCount: data.inputTokenCount,
        outputTokenCount: data.outputTokenCount,
        qualityScore: data.qualityScore,
        userRating: data.userRating,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
    }
    saveSqliteDb();
  }

  return results;
}

export async function getSummary(id: string): Promise<Summary | null> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`SELECT * FROM summaries WHERE id = ${id}`;
    if (rows.length === 0) return null;
    return rowToSummary(rows[0] as Record<string, unknown>);
  } else {
    const rows = sqliteGetAll(`SELECT * FROM summaries WHERE id = ?`, [id]);
    if (rows.length === 0) return null;
    return rowToSummary(rows[0]);
  }
}

export async function getSummariesBySource(
  sourceId: string,
  summaryType?: SummaryType,
  currentOnly: boolean = true
): Promise<Summary[]> {
  await initializeDb();

  if (usePostgres) {
    if (summaryType) {
      const rows = await sql!`
        SELECT * FROM summaries
        WHERE source_id = ${sourceId}
          AND summary_type = ${summaryType}
          ${currentOnly ? sql!`AND is_current = true` : sql!``}
        ORDER BY created_at DESC
      `;
      return rows.map((row) => rowToSummary(row as Record<string, unknown>));
    } else {
      const rows = await sql!`
        SELECT * FROM summaries
        WHERE source_id = ${sourceId}
          ${currentOnly ? sql!`AND is_current = true` : sql!``}
        ORDER BY
          CASE summary_type
            WHEN 'executive' THEN 1
            WHEN 'key_points' THEN 2
            WHEN 'detailed' THEN 3
            WHEN 'segment' THEN 4
          END,
          created_at DESC
      `;
      return rows.map((row) => rowToSummary(row as Record<string, unknown>));
    }
  } else {
    let query = `SELECT * FROM summaries WHERE source_id = ?`;
    const params: unknown[] = [sourceId];

    if (summaryType) {
      query += ` AND summary_type = ?`;
      params.push(summaryType);
    }
    if (currentOnly) {
      query += ` AND is_current = 1`;
    }
    query += ` ORDER BY
      CASE summary_type
        WHEN 'executive' THEN 1
        WHEN 'key_points' THEN 2
        WHEN 'detailed' THEN 3
        WHEN 'segment' THEN 4
      END,
      created_at DESC`;

    const rows = sqliteGetAll(query, params);
    return rows.map(rowToSummary);
  }
}

export async function updateSummary(id: string, updates: UpdateSummaryInput): Promise<void> {
  await initializeDb();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      UPDATE summaries
      SET title = COALESCE(${updates.title || null}, title),
          content = COALESCE(${updates.content || null}, content),
          quality_score = COALESCE(${updates.qualityScore || null}, quality_score),
          user_rating = COALESCE(${updates.userRating || null}, user_rating),
          updated_at = ${now}
      WHERE id = ${id}
    `;
  } else {
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      params.push(updates.title);
    }
    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      params.push(updates.content);
    }
    if (updates.qualityScore !== undefined) {
      setClauses.push('quality_score = ?');
      params.push(updates.qualityScore);
    }
    if (updates.userRating !== undefined) {
      setClauses.push('user_rating = ?');
      params.push(updates.userRating);
    }

    params.push(id);
    sqliteRun(`UPDATE summaries SET ${setClauses.join(', ')} WHERE id = ?`, params);
  }
}

export async function deleteSummary(id: string): Promise<void> {
  await initializeDb();
  if (usePostgres) {
    await sql!`DELETE FROM summaries WHERE id = ${id}`;
  } else {
    sqliteRun(`DELETE FROM summaries WHERE id = ?`, [id]);
  }
}

export async function getSummaryVersions(sourceId: string, summaryType: SummaryType): Promise<Summary[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT * FROM summaries
      WHERE source_id = ${sourceId} AND summary_type = ${summaryType}
      ORDER BY version DESC
    `;
    return rows.map((row) => rowToSummary(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT * FROM summaries WHERE source_id = ? AND summary_type = ? ORDER BY version DESC`,
      [sourceId, summaryType]
    );
    return rows.map(rowToSummary);
  }
}

// ============================================================================
// Document Segment operations
// ============================================================================

export async function createDocumentSegments(
  segments: CreateDocumentSegmentInput[]
): Promise<DocumentSegment[]> {
  await initializeDb();
  if (segments.length === 0) return [];

  const now = new Date().toISOString();
  const results: DocumentSegment[] = [];

  if (usePostgres) {
    await sql!.begin(async (tx: postgres.TransactionSql) => {
      for (const seg of segments) {
        const id = nanoid();
        await tx.unsafe(
          `INSERT INTO document_segments (
            id, source_id, segment_index, start_index, end_index,
            section_title, level, estimated_tokens, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id, seg.sourceId, seg.segmentIndex, seg.startIndex || null, seg.endIndex || null,
            seg.sectionTitle || null, seg.level, seg.estimatedTokens || null, now
          ]
        );
        results.push({ id, ...seg, createdAt: new Date(now) });
      }
    });
  } else {
    for (const seg of segments) {
      const id = nanoid();
      sqliteDb!.run(
        `INSERT INTO document_segments (
          id, source_id, segment_index, start_index, end_index,
          section_title, level, estimated_tokens, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, seg.sourceId, seg.segmentIndex, seg.startIndex || null, seg.endIndex || null,
          seg.sectionTitle || null, seg.level, seg.estimatedTokens || null, now
        ]
      );
      results.push({ id, ...seg, createdAt: new Date(now) });
    }
    saveSqliteDb();
  }

  return results;
}

export async function getDocumentSegments(sourceId: string): Promise<DocumentSegment[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT * FROM document_segments WHERE source_id = ${sourceId} ORDER BY segment_index ASC
    `;
    return rows.map((row) => rowToDocumentSegment(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT * FROM document_segments WHERE source_id = ? ORDER BY segment_index ASC`,
      [sourceId]
    );
    return rows.map(rowToDocumentSegment);
  }
}

export async function deleteDocumentSegments(sourceId: string): Promise<void> {
  await initializeDb();

  if (usePostgres) {
    await sql!`DELETE FROM document_segments WHERE source_id = ${sourceId}`;
  } else {
    sqliteRun(`DELETE FROM document_segments WHERE source_id = ?`, [sourceId]);
  }
}

// ============================================================================
// Collection operations
// ============================================================================

export async function createCollection(data: CreateCollectionInput): Promise<SummaryCollection> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      INSERT INTO summary_collections (id, name, description, collection_type, created_at)
      VALUES (${id}, ${data.name}, ${data.description || null}, ${data.collectionType}, ${now})
    `;
  } else {
    sqliteRun(
      `INSERT INTO summary_collections (id, name, description, collection_type, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, data.name, data.description || null, data.collectionType, now]
    );
  }

  return {
    id,
    name: data.name,
    description: data.description,
    collectionType: data.collectionType,
    createdAt: new Date(now),
  };
}

export async function getCollections(): Promise<SummaryCollection[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT sc.*, COUNT(cs.id) as source_count
      FROM summary_collections sc
      LEFT JOIN collection_sources cs ON cs.collection_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
    `;
    return rows.map((row) => rowToCollection(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(`
      SELECT sc.*, COUNT(cs.id) as source_count
      FROM summary_collections sc
      LEFT JOIN collection_sources cs ON cs.collection_id = sc.id
      GROUP BY sc.id
      ORDER BY sc.created_at DESC
    `);
    return rows.map(rowToCollection);
  }
}

export async function getCollection(id: string): Promise<SummaryCollection | null> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT sc.*, COUNT(cs.id) as source_count
      FROM summary_collections sc
      LEFT JOIN collection_sources cs ON cs.collection_id = sc.id
      WHERE sc.id = ${id}
      GROUP BY sc.id
    `;
    if (rows.length === 0) return null;
    return rowToCollection(rows[0] as Record<string, unknown>);
  } else {
    const rows = sqliteGetAll(`
      SELECT sc.*, COUNT(cs.id) as source_count
      FROM summary_collections sc
      LEFT JOIN collection_sources cs ON cs.collection_id = sc.id
      WHERE sc.id = ?
      GROUP BY sc.id
    `, [id]);
    if (rows.length === 0) return null;
    return rowToCollection(rows[0]);
  }
}

export async function addSourceToCollection(data: CreateCollectionSourceInput): Promise<CollectionSource> {
  await initializeDb();
  const id = nanoid();

  if (usePostgres) {
    await sql!`
      INSERT INTO collection_sources (id, collection_id, source_id, sequence, weight)
      VALUES (${id}, ${data.collectionId}, ${data.sourceId}, ${data.sequence || null}, ${data.weight})
    `;
  } else {
    sqliteRun(
      `INSERT INTO collection_sources (id, collection_id, source_id, sequence, weight)
       VALUES (?, ?, ?, ?, ?)`,
      [id, data.collectionId, data.sourceId, data.sequence || null, data.weight]
    );
  }

  return { id, ...data };
}

export async function getCollectionSources(collectionId: string): Promise<CollectionSource[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT * FROM collection_sources WHERE collection_id = ${collectionId} ORDER BY sequence ASC
    `;
    return rows.map((row) => rowToCollectionSource(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT * FROM collection_sources WHERE collection_id = ? ORDER BY sequence ASC`,
      [collectionId]
    );
    return rows.map(rowToCollectionSource);
  }
}

// ============================================================================
// Concept operations
// ============================================================================

export async function createConcepts(concepts: CreateConceptInput[]): Promise<SummaryConcept[]> {
  await initializeDb();
  if (concepts.length === 0) return [];

  const results: SummaryConcept[] = [];

  if (usePostgres) {
    await sql!.begin(async (tx: postgres.TransactionSql) => {
      for (const concept of concepts) {
        const id = nanoid();
        await tx.unsafe(
          `INSERT INTO summary_concepts (id, summary_id, concept, concept_normalized, definition, importance_score)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, concept.summaryId, concept.concept, concept.conceptNormalized, concept.definition || null, concept.importanceScore]
        );
        results.push({ id, ...concept });
      }
    });
  } else {
    for (const concept of concepts) {
      const id = nanoid();
      sqliteDb!.run(
        `INSERT INTO summary_concepts (id, summary_id, concept, concept_normalized, definition, importance_score)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, concept.summaryId, concept.concept, concept.conceptNormalized, concept.definition || null, concept.importanceScore]
      );
      results.push({ id, ...concept });
    }
    saveSqliteDb();
  }

  return results;
}

export async function getConceptsBySummary(summaryId: string): Promise<SummaryConcept[]> {
  await initializeDb();

  if (usePostgres) {
    const rows = await sql!`
      SELECT * FROM summary_concepts WHERE summary_id = ${summaryId} ORDER BY importance_score DESC
    `;
    return rows.map((row) => rowToConcept(row as Record<string, unknown>));
  } else {
    const rows = sqliteGetAll(
      `SELECT * FROM summary_concepts WHERE summary_id = ? ORDER BY importance_score DESC`,
      [summaryId]
    );
    return rows.map(rowToConcept);
  }
}

// ============================================================================
// Export operations
// ============================================================================

export async function createExport(data: CreateExportInput): Promise<SummaryExport> {
  await initializeDb();
  const id = nanoid();
  const now = new Date().toISOString();

  if (usePostgres) {
    await sql!`
      INSERT INTO summary_exports (id, summary_id, export_format, file_path, created_at)
      VALUES (${id}, ${data.summaryId}, ${data.exportFormat}, ${data.filePath || null}, ${now})
    `;
  } else {
    sqliteRun(
      `INSERT INTO summary_exports (id, summary_id, export_format, file_path, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, data.summaryId, data.exportFormat, data.filePath || null, now]
    );
  }

  return {
    id,
    summaryId: data.summaryId,
    exportFormat: data.exportFormat,
    filePath: data.filePath,
    downloadCount: 0,
    createdAt: new Date(now),
  };
}

export async function incrementExportDownloadCount(id: string): Promise<void> {
  await initializeDb();

  if (usePostgres) {
    await sql!`UPDATE summary_exports SET download_count = download_count + 1 WHERE id = ${id}`;
  } else {
    sqliteRun(`UPDATE summary_exports SET download_count = download_count + 1 WHERE id = ?`, [id]);
  }
}

// ============================================================================
// Row converters
// ============================================================================

function rowToSummary(row: Record<string, unknown>): Summary {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    summaryType: row.summary_type as SummaryType,
    title: row.title as string,
    content: row.content as string,
    wordCount: Number(row.word_count) || 0,
    version: Number(row.version) || 1,
    // Fix: Handle both SQLite (0/1) and PostgreSQL (true/false) boolean values
    isCurrent: row.is_current === true || row.is_current === 1 || row.is_current === '1',
    parentVersionId: row.parent_version_id ? String(row.parent_version_id) : undefined,
    generationModel: row.generation_model as string,
    generationDurationMs: row.generation_duration_ms ? Number(row.generation_duration_ms) : undefined,
    inputTokenCount: row.input_token_count ? Number(row.input_token_count) : undefined,
    outputTokenCount: row.output_token_count ? Number(row.output_token_count) : undefined,
    qualityScore: row.quality_score ? Number(row.quality_score) : undefined,
    userRating: row.user_rating ? Number(row.user_rating) as 1 | 2 | 3 | 4 | 5 : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function rowToDocumentSegment(row: Record<string, unknown>): DocumentSegment {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    segmentIndex: Number(row.segment_index),
    startIndex: row.start_index ? Number(row.start_index) : undefined,
    endIndex: row.end_index ? Number(row.end_index) : undefined,
    sectionTitle: row.section_title as string | undefined,
    level: Number(row.level) || 0,
    estimatedTokens: row.estimated_tokens ? Number(row.estimated_tokens) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToCollection(row: Record<string, unknown>): SummaryCollection {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    collectionType: row.collection_type as CollectionType,
    aggregatedSummaryId: row.aggregated_summary_id as string | undefined,
    createdAt: new Date(row.created_at as string),
    sourceCount: row.source_count ? Number(row.source_count) : undefined,
  };
}

function rowToCollectionSource(row: Record<string, unknown>): CollectionSource {
  return {
    id: row.id as string,
    collectionId: row.collection_id as string,
    sourceId: row.source_id as string,
    sequence: row.sequence !== null && row.sequence !== undefined ? Number(row.sequence) : undefined,
    // Fix: Don't convert weight 0 to 1.0 - properly check for null/undefined
    weight: row.weight !== null && row.weight !== undefined ? Number(row.weight) : 1.0,
  };
}

function rowToConcept(row: Record<string, unknown>): SummaryConcept {
  return {
    id: row.id as string,
    summaryId: row.summary_id as string,
    concept: row.concept as string,
    conceptNormalized: row.concept_normalized as string,
    definition: row.definition as string | undefined,
    importanceScore: Number(row.importance_score) || 0.5,
  };
}

function rowToSource(row: Record<string, unknown>): Source {
  return {
    id: row.id as string,
    type: row.type as SourceType,
    title: row.title as string,
    originalUrl: row.original_url as string | undefined,
    filePath: row.file_path as string | undefined,
    rawText: row.raw_text as string | undefined,
    processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    // Fix: Don't convert 0 to undefined - properly check for null/undefined
    lessonCount: row.lesson_count !== null && row.lesson_count !== undefined ? Number(row.lesson_count) : undefined,
    cardCount: row.card_count !== null && row.card_count !== undefined ? Number(row.card_count) : undefined,
  };
}

function rowToMicroLesson(row: Record<string, unknown>): MicroLesson {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    sequence: Number(row.sequence),
    title: row.title as string,
    hook: row.hook as string,
    content: row.content as string,
    keyTakeaway: row.key_takeaway as string,
    estimatedMinutes: Number(row.estimated_minutes),
    difficulty: Number(row.difficulty) as 1 | 2 | 3,
    audioPath: row.audio_path as string | undefined,
    createdAt: new Date(row.created_at as string),
    isCompleted: Boolean(row.is_completed),
  };
}

function rowToFlashcard(row: Record<string, unknown>): Flashcard {
  return {
    id: row.id as string,
    lessonId: row.lesson_id as string,
    front: row.front as string,
    back: row.back as string,
    hint: row.hint as string | undefined,
    mnemonic: row.mnemonic as string | undefined,
    visualCue: row.visual_cue as string | undefined,
    easeFactor: Number(row.ease_factor),
    interval: Number(row.interval),
    repetitions: Number(row.repetitions),
    nextReview: row.next_review ? new Date(row.next_review as string) : undefined,
    createdAt: new Date(row.created_at as string),
  };
}
