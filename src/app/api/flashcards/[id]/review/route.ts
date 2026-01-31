// API route for reviewing a flashcard
import { NextRequest, NextResponse } from 'next/server';
import { initializeDb, updateFlashcardAfterReview, recordFlashcardReview, getFlashcard } from '@/lib/db/client';
import { calculateSM2, simpleToSM2Rating } from '@/lib/services/sm2';
import { validateBody, FlashcardReviewSchema } from '@/lib/validations';

// POST /api/flashcards/[id]/review - Submit a review for a flashcard
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;

    // Validate request body with Zod
    const validation = await validateBody(request, FlashcardReviewSchema);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    const { rating, timeToAnswerMs } = validation.data;

    // Get the flashcard
    const flashcard = await getFlashcard(id);

    if (!flashcard) {
      return NextResponse.json(
        { error: 'Flashcard not found' },
        { status: 404 }
      );
    }

    // Convert simple rating to SM-2 rating
    const sm2Rating = simpleToSM2Rating(rating);

    // Calculate new SM-2 values
    const result = calculateSM2({
      rating: sm2Rating,
      previousEaseFactor: flashcard.easeFactor,
      previousInterval: flashcard.interval,
      previousRepetitions: flashcard.repetitions,
    });

    // Update the flashcard
    await updateFlashcardAfterReview(
      id,
      result.easeFactor,
      result.interval,
      result.repetitions,
      result.nextReview
    );

    // Record the review for analytics
    await recordFlashcardReview(id, sm2Rating, timeToAnswerMs || 0);

    return NextResponse.json({
      success: true,
      nextReview: result.nextReview,
      interval: result.interval,
      easeFactor: result.easeFactor,
      repetitions: result.repetitions,
    });
  } catch (error) {
    console.error('Error reviewing flashcard:', error);
    return NextResponse.json(
      { error: 'Failed to review flashcard' },
      { status: 500 }
    );
  }
}
