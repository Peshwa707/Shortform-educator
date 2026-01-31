// Zod validation schemas for API routes
import { z } from 'zod';
import { FileUploadLimits } from './constants';

// Source creation schemas
export const TextSourceSchema = z.object({
  type: z.literal('text'),
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  text: z.string()
    .min(1, 'Text is required')
    .max(FileUploadLimits.MAX_TEXT_LENGTH, `Text exceeds ${FileUploadLimits.MAX_TEXT_LENGTH} characters`),
});

export const YouTubeSourceSchema = z.object({
  type: z.literal('youtube'),
  url: z.string().url('Invalid URL').refine(
    (url) => url.includes('youtube.com') || url.includes('youtu.be'),
    'Must be a YouTube URL'
  ),
});

export const AudioSourceSchema = z.object({
  type: z.literal('audio'),
  // Audio fields TBD in Phase 2
});

export const CreateSourceSchema = z.discriminatedUnion('type', [
  TextSourceSchema,
  YouTubeSourceSchema,
  AudioSourceSchema,
]);

// Flashcard review schema
export const FlashcardReviewSchema = z.object({
  rating: z.enum(['again', 'hard', 'good', 'easy'], {
    message: 'Rating must be one of: again, hard, good, easy',
  }),
  timeToAnswerMs: z.number()
    .int({ message: 'Time must be an integer' })
    .nonnegative({ message: 'Time cannot be negative' })
    .max(600000, { message: 'Time exceeds maximum (10 minutes)' })
    .optional(),
});

// Query parameter schemas
export const FlashcardsQuerySchema = z.object({
  due: z.enum(['true', 'false']).optional().transform(v => v === 'true'),
  limit: z.string().optional().transform(v => {
    if (!v) return 20;
    const num = parseInt(v, 10);
    return isNaN(num) ? 20 : Math.min(Math.max(num, 1), 100);
  }),
  sourceId: z.string().uuid('Invalid source ID').optional(),
});

// Source ID parameter schema
export const SourceIdSchema = z.object({
  sourceId: z.string().uuid('Invalid source ID'),
});

// Flashcard ID parameter schema
export const FlashcardIdSchema = z.object({
  id: z.string().uuid('Invalid flashcard ID'),
});

// Processing status update schema
export const ProcessingStatusSchema = z.object({
  status: z.enum([
    'pending',
    'extracting',
    'chunking',
    'generating_cards',
    'generating_audio',
    'complete',
    'error',
  ]),
  error: z.string().optional(),
});

// Helper function to validate and parse request body
export async function validateBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);

    if (!result.success) {
      const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
      return { success: false, error: errors.join(', ') };
    }

    return { success: true, data: result.data };
  } catch {
    return { success: false, error: 'Invalid JSON body' };
  }
}

// Helper function to validate query parameters
export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);

  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
    return { success: false, error: errors.join(', ') };
  }

  return { success: true, data: result.data };
}

// Helper function to validate route parameters
export function validateParams<T>(
  params: Record<string, string>,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(params);

  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`);
    return { success: false, error: errors.join(', ') };
  }

  return { success: true, data: result.data };
}
