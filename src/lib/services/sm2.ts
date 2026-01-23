// SM-2 Spaced Repetition Algorithm Implementation
// Based on the SuperMemo 2 algorithm by Piotr Wozniak

import { SM2Result, FlashcardRating } from '@/types';
import { addDays } from 'date-fns';

/**
 * SM-2 Algorithm for spaced repetition
 *
 * Rating scale:
 * 0 - Complete blackout, no recognition
 * 1 - Incorrect, but upon seeing the answer, remembered
 * 2 - Incorrect, but answer seemed easy to recall after seeing it
 * 3 - Correct with serious difficulty
 * 4 - Correct after hesitation
 * 5 - Correct, perfect response
 *
 * For ADHD users, we also provide simplified ratings:
 * "Again" (0-1), "Hard" (2-3), "Good" (4), "Easy" (5)
 */

export interface SM2Input {
  rating: FlashcardRating;
  previousEaseFactor: number;
  previousInterval: number;
  previousRepetitions: number;
}

export function calculateSM2(input: SM2Input): SM2Result {
  const { rating, previousEaseFactor, previousInterval, previousRepetitions } = input;

  let easeFactor = previousEaseFactor;
  let interval: number;
  let repetitions: number;

  // If rating < 3, reset the card (incorrect answer)
  if (rating < 3) {
    repetitions = 0;
    interval = 1; // Review tomorrow
  } else {
    // Correct answer - increment repetitions
    repetitions = previousRepetitions + 1;

    // Calculate new interval based on repetition count
    if (repetitions === 1) {
      interval = 1; // First successful review: 1 day
    } else if (repetitions === 2) {
      interval = 6; // Second successful review: 6 days
    } else {
      // Subsequent reviews: multiply previous interval by ease factor
      interval = Math.round(previousInterval * easeFactor);
    }
  }

  // Update ease factor based on rating
  // EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  // where q is the rating (0-5)
  const newEaseFactor =
    easeFactor + (0.1 - (5 - rating) * (0.08 + (5 - rating) * 0.02));

  // Ease factor should never go below 1.3
  easeFactor = Math.max(1.3, newEaseFactor);

  // Calculate next review date
  const nextReview = addDays(new Date(), interval);

  return {
    easeFactor: Math.round(easeFactor * 100) / 100, // Round to 2 decimal places
    interval,
    repetitions,
    nextReview,
  };
}

/**
 * Convert simple ADHD-friendly ratings to SM-2 scale
 */
export type SimpleRating = 'again' | 'hard' | 'good' | 'easy';

export function simpleToSM2Rating(simple: SimpleRating): FlashcardRating {
  switch (simple) {
    case 'again':
      return 1; // Incorrect, but remembered after seeing answer
    case 'hard':
      return 3; // Correct with difficulty
    case 'good':
      return 4; // Correct after hesitation
    case 'easy':
      return 5; // Perfect response
    default:
      return 3;
  }
}

/**
 * Get button colors/styles for rating buttons (ADHD-friendly visual cues)
 */
export function getRatingStyle(rating: SimpleRating): {
  color: string;
  bgColor: string;
  hoverBgColor: string;
  label: string;
  sublabel: string;
} {
  switch (rating) {
    case 'again':
      return {
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        hoverBgColor: 'hover:bg-red-200',
        label: 'Again',
        sublabel: '< 1 day',
      };
    case 'hard':
      return {
        color: 'text-orange-700',
        bgColor: 'bg-orange-100',
        hoverBgColor: 'hover:bg-orange-200',
        label: 'Hard',
        sublabel: '~1 day',
      };
    case 'good':
      return {
        color: 'text-green-700',
        bgColor: 'bg-green-100',
        hoverBgColor: 'hover:bg-green-200',
        label: 'Good',
        sublabel: 'Normal',
      };
    case 'easy':
      return {
        color: 'text-blue-700',
        bgColor: 'bg-blue-100',
        hoverBgColor: 'hover:bg-blue-200',
        label: 'Easy',
        sublabel: 'Longer',
      };
  }
}

/**
 * Format interval for display
 */
export function formatInterval(days: number): string {
  if (days < 1) return 'Today';
  if (days === 1) return '1 day';
  if (days < 7) return `${days} days`;
  if (days < 30) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? '1 week' : `${weeks} weeks`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? '1 month' : `${months} months`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? '1 year' : `${years} years`;
}

/**
 * Calculate predicted next intervals for all rating options
 * Useful for showing users what will happen with each choice
 */
export function predictNextIntervals(
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number
): Record<SimpleRating, string> {
  const ratings: SimpleRating[] = ['again', 'hard', 'good', 'easy'];

  return ratings.reduce(
    (acc, simpleRating) => {
      const rating = simpleToSM2Rating(simpleRating);
      const result = calculateSM2({
        rating,
        previousEaseFactor: currentEaseFactor,
        previousInterval: currentInterval,
        previousRepetitions: currentRepetitions,
      });
      acc[simpleRating] = formatInterval(result.interval);
      return acc;
    },
    {} as Record<SimpleRating, string>
  );
}
