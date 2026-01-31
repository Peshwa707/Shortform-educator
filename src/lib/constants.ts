// Centralized constants for the application

// Processing status values
export const ProcessingStatus = {
  PENDING: 'pending',
  EXTRACTING: 'extracting',
  CHUNKING: 'chunking',
  GENERATING_CARDS: 'generating_cards',
  GENERATING_AUDIO: 'generating_audio',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

export type ProcessingStatusType = typeof ProcessingStatus[keyof typeof ProcessingStatus];

// File upload limits
export const FileUploadLimits = {
  MAX_FILE_SIZE_MB: 50,
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,
  MAX_TEXT_LENGTH: 100000,
  ALLOWED_PDF_MIME_TYPES: ['application/pdf'],
} as const;

// Polling intervals (in milliseconds)
export const PollingIntervals = {
  PROCESSING_STATUS: 1000,
  PROCESSING_STATUS_SLOW: 2000,
  RETRY_DELAY: 500,
} as const;

// SM-2 algorithm defaults
export const SM2Defaults = {
  INITIAL_EASE_FACTOR: 2.5,
  MIN_EASE_FACTOR: 1.3,
  FIRST_INTERVAL: 1,
  SECOND_INTERVAL: 6,
} as const;

// AI content generation limits
export const AILimits = {
  MAX_INPUT_CHARACTERS: 100000,
  MIN_LESSONS: 3,
  MAX_LESSONS: 10,
  CARDS_PER_LESSON: { MIN: 3, MAX: 4 },
} as const;

// UI constants
export const UIConstants = {
  DEFAULT_PAGE_SIZE: 20,
  TOAST_DURATION_MS: 4000,
  DEBOUNCE_DELAY_MS: 300,
} as const;
