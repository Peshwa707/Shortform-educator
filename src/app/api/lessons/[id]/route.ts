// API routes for individual lesson operations
import { NextRequest, NextResponse } from 'next/server';
import { getMicroLesson, markLessonComplete, getFlashcardsByLesson, initializeDb } from '@/lib/db/client';

// GET /api/lessons/[id] - Get a single lesson with its flashcards
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;
    const lesson = await getMicroLesson(id);

    if (!lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }

    const flashcards = await getFlashcardsByLesson(id);

    return NextResponse.json({ lesson, flashcards });
  } catch (error) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lesson' },
      { status: 500 }
    );
  }
}

// POST /api/lessons/[id] - Mark lesson as complete
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;
    const body = await request.json();
    const { timeSpentSeconds, comprehensionRating } = body;

    const lesson = await getMicroLesson(id);

    if (!lesson) {
      return NextResponse.json(
        { error: 'Lesson not found' },
        { status: 404 }
      );
    }

    // Validate comprehension rating
    if (!comprehensionRating || comprehensionRating < 1 || comprehensionRating > 5) {
      return NextResponse.json(
        { error: 'comprehensionRating must be between 1 and 5' },
        { status: 400 }
      );
    }

    const progress = await markLessonComplete(
      id,
      timeSpentSeconds || 0,
      comprehensionRating as 1 | 2 | 3 | 4 | 5
    );

    return NextResponse.json({ progress });
  } catch (error) {
    console.error('Error marking lesson complete:', error);
    return NextResponse.json(
      { error: 'Failed to mark lesson complete' },
      { status: 500 }
    );
  }
}
