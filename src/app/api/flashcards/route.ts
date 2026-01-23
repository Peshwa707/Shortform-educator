// API routes for flashcards
import { NextRequest, NextResponse } from 'next/server';
import {
  getDueFlashcards,
  getFlashcardsBySource,
  getFlashcardsByLesson,
  initializeDb,
} from '@/lib/db/client';

// GET /api/flashcards - Get flashcards
// Query params:
//   - due=true: Get due flashcards for review
//   - sourceId=xxx: Get all flashcards for a source
//   - lessonId=xxx: Get all flashcards for a lesson
//   - limit=20: Limit number of cards returned
export async function GET(request: NextRequest) {
  try {
    await initializeDb();
    const { searchParams } = new URL(request.url);
    const due = searchParams.get('due') === 'true';
    const sourceId = searchParams.get('sourceId');
    const lessonId = searchParams.get('lessonId');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    let flashcards;

    if (due) {
      // Get due flashcards for review
      flashcards = await getDueFlashcards(limit);
    } else if (sourceId) {
      // Get all flashcards for a source
      flashcards = await getFlashcardsBySource(sourceId);
    } else if (lessonId) {
      // Get all flashcards for a lesson
      flashcards = await getFlashcardsByLesson(lessonId);
    } else {
      // Get all due flashcards by default
      flashcards = await getDueFlashcards(limit);
    }

    return NextResponse.json({
      flashcards,
      count: flashcards.length,
    });
  } catch (error) {
    console.error('Error fetching flashcards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flashcards' },
      { status: 500 }
    );
  }
}
