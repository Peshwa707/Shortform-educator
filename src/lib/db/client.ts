// Database client - supports both SQLite (local) and PostgreSQL (production)
// Uses SQLite when DATABASE_URL is not set, PostgreSQL when it is

import { Source, MicroLesson, Flashcard, Progress, SourceType } from '@/types';
import { nanoid } from 'nanoid';
import fs from 'fs';
import path from 'path';

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
    // PostgreSQL initialization
    const schemaPath = path.join(process.cwd(), 'src', 'lib', 'db', 'schema-postgres.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    const statements = schema.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
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
// Row converters
// ============================================================================

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
    lessonCount: Number(row.lesson_count) || undefined,
    cardCount: Number(row.card_count) || undefined,
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
