// Centralized AI configuration for ADHD Learning Bot
// Controls model selection, token limits, and content generation parameters

export const AI_CONFIG = {
  // Model configuration
  model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',

  // Input limits
  maxInputChars: 100000, // ~25k tokens

  // Token limits for different operations
  tokenLimits: {
    chunkContent: 8000,
    generateFlashcards: 2000,
    simplifyText: 2000,
  },

  // Content generation guidelines
  contentGuidelines: {
    // Word count targets by difficulty
    wordCountByDifficulty: {
      1: { min: 300, max: 400, target: 350 }, // Beginner: shorter, simpler
      2: { min: 400, max: 500, target: 450 }, // Intermediate
      3: { min: 450, max: 550, target: 500 }, // Advanced: more depth
    },
    // Legacy fallback (used if difficulty not specified)
    minChunkWords: 350,
    maxChunkWords: 550,
    targetChunkWords: 450,

    // Lesson generation limits
    minLessons: 3,
    maxLessons: 10,

    // Flashcard generation
    flashcardsPerLesson: 3,

    // ADHD-specific formatting
    subheadingFrequency: '50-100 words',
    examplesPerConcept: '1-2',
    requireTransitionSentences: true,
    linearProgression: true, // No nested explanations
    includeReflectionQuestions: true,
  },

  // Flashcard question type distribution
  flashcardTypes: {
    definitional: 0.30,  // "What is [term]?"
    conceptual: 0.30,    // "Why does [concept] work?"
    application: 0.25,   // "How would you apply...?"
    procedural: 0.15,    // "What are the steps to...?"
  },

  // Hint quality guidelines
  hintGuidelines: {
    useSemanticClues: true,     // Not letter-based hints
    connectRealWorld: true,     // Real-world context connections
    reEngagementPrompts: true,  // Prompts for stuck learners
  },
} as const;

export type AIConfig = typeof AI_CONFIG;
