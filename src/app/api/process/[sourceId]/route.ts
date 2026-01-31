// API route for processing a source into micro-lessons and flashcards
import { NextRequest, NextResponse } from 'next/server';
import {
  getSource,
  updateSourceStatus,
  createMicroLessons,
  createFlashcards,
  getMicroLessons,
  initializeDb,
  getOne,
} from '@/lib/db/client';
import { chunkContent } from '@/lib/ai/chunker';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  RateLimitConfigs,
} from '@/lib/rate-limiter';

// POST /api/process/[sourceId] - Process a source into micro-lessons
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  // Rate limit AI processing - expensive operation
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(
    `process:${clientIP}`,
    RateLimitConfigs.AI_PROCESSING
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many processing requests. Please wait before trying again.' },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  }

  try {
    await initializeDb();
    const { sourceId } = await params;
    const source = await getSource(sourceId);

    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    if (!source.rawText) {
      return NextResponse.json(
        { error: 'Source has no text content to process' },
        { status: 400 }
      );
    }

    // Check if already processed
    const existingLessons = await getMicroLessons(sourceId);
    if (existingLessons.length > 0) {
      return NextResponse.json({
        message: 'Source already processed',
        lessonCount: existingLessons.length,
      });
    }

    // Update status to processing
    await updateSourceStatus(sourceId, 'chunking', 10);

    try {
      // Process content with AI
      const result = await chunkContent(source.rawText, sourceId, source.title);

      await updateSourceStatus(sourceId, 'generating_cards', 50);

      // Create lessons in database
      const lessons = await createMicroLessons(result.lessons);

      // Create flashcards and link to lessons
      // Distribute flashcards across lessons
      const cardsPerLesson = Math.ceil(result.flashcards.length / lessons.length);

      for (let i = 0; i < lessons.length; i++) {
        const lessonFlashcards = result.flashcards.slice(
          i * cardsPerLesson,
          (i + 1) * cardsPerLesson
        );

        if (lessonFlashcards.length > 0) {
          await createFlashcards(
            lessonFlashcards.map((card) => ({
              ...card,
              lessonId: lessons[i].id,
            }))
          );
        }
      }

      // Mark as complete
      await updateSourceStatus(sourceId, 'complete', 100);

      return NextResponse.json({
        success: true,
        lessonCount: lessons.length,
        flashcardCount: result.flashcards.length,
      });
    } catch (aiError) {
      console.error('AI processing error:', aiError);
      await updateSourceStatus(
        sourceId,
        'error',
        0,
        aiError instanceof Error ? aiError.message : 'AI processing failed'
      );
      throw aiError;
    }
  } catch (error) {
    console.error('Error processing source:', error);
    return NextResponse.json(
      { error: 'Failed to process source' },
      { status: 500 }
    );
  }
}

// GET /api/process/[sourceId] - Get processing status
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  try {
    await initializeDb();
    const { sourceId } = await params;
    const source = await getSource(sourceId);

    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    // Get the status from the raw database query since Source type doesn't have status
    const row = await getOne<{ processing_status: string; processing_progress: number; error_message: string | null }>(
      'SELECT processing_status, processing_progress, error_message FROM sources WHERE id = $1',
      [sourceId]
    );

    return NextResponse.json({
      sourceId,
      status: row?.processing_status || 'pending',
      progress: row?.processing_progress || 0,
      error: row?.error_message,
    });
  } catch (error) {
    console.error('Error getting process status:', error);
    return NextResponse.json(
      { error: 'Failed to get processing status' },
      { status: 500 }
    );
  }
}
