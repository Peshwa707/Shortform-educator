// AI-Powered Content Chunking Service
// Breaks content into ADHD-friendly micro-lessons using Claude

import Anthropic from '@anthropic-ai/sdk';
import { MicroLesson, Flashcard } from '@/types';
import { AI_CONFIG } from '@/config/ai-config';

const anthropic = new Anthropic();

interface ChunkingResult {
  lessons: Omit<MicroLesson, 'id' | 'createdAt' | 'audioPath'>[];
  flashcards: Omit<Flashcard, 'id' | 'createdAt' | 'lessonId'>[];
}

/**
 * Attempt to repair common JSON issues from AI responses
 */
function repairJson(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // Remove any leading/trailing text that isn't JSON
  const startIdx = repaired.indexOf('{');
  if (startIdx > 0) {
    repaired = repaired.slice(startIdx);
  }

  // Try to fix truncated arrays by closing them
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    repaired += ']'.repeat(openBrackets - closeBrackets);
  }

  // Try to fix truncated objects by closing them
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }

  // Remove trailing commas before closing brackets/braces
  repaired = repaired.replace(/,\s*([\]}])/g, '$1');

  return repaired;
}

/**
 * Process content into ADHD-friendly micro-lessons and flashcards
 */
export async function chunkContent(
  text: string,
  sourceId: string,
  title: string
): Promise<ChunkingResult> {
  // Truncate very long content to fit context window
  const truncatedText = text.length > AI_CONFIG.maxInputChars
    ? text.slice(0, AI_CONFIG.maxInputChars) + '\n\n[Content truncated...]'
    : text;

  const systemPrompt = `You are an expert educational content designer specializing in ADHD-friendly learning materials. Your task is to transform raw text into engaging micro-lessons optimized for ADHD learners.

## Core Principles for ADHD-Friendly Content

### 1. CHUNKING (Critical)
- Break content into ${AI_CONFIG.contentGuidelines.minChunkWords}-${AI_CONFIG.contentGuidelines.maxChunkWords} word segments
- Target ${AI_CONFIG.contentGuidelines.targetChunkWords} words per chunk (2-5 minute reads)
- Adjust by difficulty:
  * Difficulty 1 (beginner): 300-400 words, simpler concepts
  * Difficulty 2 (intermediate): 400-500 words
  * Difficulty 3 (advanced): 450-550 words, more depth allowed

### 2. COGNITIVE LOAD MANAGEMENT (ADHD-Specific)
- Add subheadings every ${AI_CONFIG.contentGuidelines.subheadingFrequency} to create visual breaks
- Include ${AI_CONFIG.contentGuidelines.examplesPerConcept} concrete, real-world examples per concept
- Use explicit transition sentences between paragraphs ("Now that we understand X, let's explore Y...")
- Maintain LINEAR progression - NO nested explanations or tangents
- Include a brief reflection question mid-content to re-engage wandering attention

### 3. ENGAGEMENT
- Start each chunk with a compelling "why should I care?" HOOK
- Use active voice throughout
- Incorporate relatable analogies that connect to everyday experience
- End with a clear, memorable KEY TAKEAWAY (one sentence)

### 4. CLARITY
- ONE main concept per chunk - never overload
- Define technical terms inline when first used
- Each chunk should build naturally on the previous one

## Flashcard Generation Guidelines

### Question Type Distribution (Balance These)
- ~30% Definitional: "What is [term]?" - testing recall of definitions
- ~30% Conceptual: "Why does [concept] work this way?" - testing understanding
- ~25% Application: "How would you apply [concept] to [scenario]?" - testing transfer
- ~15% Procedural: "What are the steps to [process]?" - testing sequences

### Hint Quality Guidelines
- Use SEMANTIC clues, not letter-based hints (not "starts with C...")
- Connect to real-world contexts the learner already knows
- For stuck learners, hints should help re-engage, not just give partial answers
- Example good hint: "Think about how this relates to the water cycle analogy we used"
- Example bad hint: "It starts with 'e' and ends with 'ion'"`;

  const userPrompt = `Transform the following content into micro-lessons and flashcards.

Title: "${title}"

Content:
---
${truncatedText}
---

Return a JSON object with this exact structure:
{
  "lessons": [
    {
      "sequence": 1,
      "title": "Attention-grabbing, specific title",
      "hook": "Why should I care? A compelling 1-2 sentence opener that creates curiosity",
      "content": "The main content, ${AI_CONFIG.contentGuidelines.minChunkWords}-${AI_CONFIG.contentGuidelines.maxChunkWords} words. Use markdown formatting with ## subheadings every 50-100 words. Include 1-2 concrete examples. Add explicit transition sentences. Include a brief reflection question mid-content.",
      "keyTakeaway": "One clear sentence summarizing the main point",
      "estimatedMinutes": 3,
      "difficulty": 1
    }
  ],
  "flashcards": [
    {
      "front": "Clear, specific question",
      "back": "Concise answer",
      "hint": "Semantic hint connecting to familiar concepts (not letter-based)",
      "mnemonic": "Optional memory aid or association",
      "visualCue": "Optional emoji that represents this concept"
    }
  ]
}

Critical Guidelines:
- Create ${AI_CONFIG.contentGuidelines.minLessons}-${AI_CONFIG.contentGuidelines.maxLessons} micro-lessons depending on content length
- Create ${AI_CONFIG.contentGuidelines.flashcardsPerLesson}-4 flashcards per lesson for key concepts
- Balance flashcard types: 30% definitional, 30% conceptual, 25% application, 15% procedural
- Set difficulty: 1 (beginner), 2 (intermediate), 3 (advanced)
- estimatedMinutes should be 2-5 based on content length
- Make hooks genuinely engaging, not clickbait
- Key takeaways should be memorable and actionable
- Hints must use semantic clues, never letter-based hints

Return ONLY valid JSON, no other text.`;

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.tokenLimits.chunkContent,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    system: systemPrompt,
  });

  // Extract text from response
  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  // Parse JSON response with error recovery
  let parsed: { lessons: unknown[]; flashcards: unknown[] };
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to repair common JSON issues
      const repaired = repairJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
      console.log('JSON repaired successfully');
    }
  } catch (error) {
    console.error('Failed to parse AI response:', responseText.substring(0, 500));

    // Return partial results if we can extract any lessons/flashcards
    const partialLessons = responseText.match(/"lessons"\s*:\s*\[([\s\S]*?)\]/);
    const partialFlashcards = responseText.match(/"flashcards"\s*:\s*\[([\s\S]*?)\]/);

    if (partialLessons || partialFlashcards) {
      console.log('Attempting partial recovery...');
      parsed = {
        lessons: partialLessons ? JSON.parse(`[${partialLessons[1]}]`) : [],
        flashcards: partialFlashcards ? JSON.parse(`[${partialFlashcards[1]}]`) : [],
      };
    } else {
      throw new Error('Failed to parse AI chunking response');
    }
  }

  // Validate and transform lessons
  const lessons = (parsed.lessons || []).map((lessonData: unknown, index: number) => {
    const lesson = lessonData as Record<string, unknown>;
    return {
      sourceId,
      sequence: (lesson.sequence as number) || index + 1,
      title: String(lesson.title || `Lesson ${index + 1}`),
      hook: String(lesson.hook || ''),
      content: String(lesson.content || ''),
      keyTakeaway: String(lesson.keyTakeaway || lesson.key_takeaway || ''),
      estimatedMinutes: Number(lesson.estimatedMinutes || lesson.estimated_minutes) || 3,
      difficulty: (lesson.difficulty as 1 | 2 | 3) || 1,
    };
  });

  // Validate and transform flashcards
  const flashcards = (parsed.flashcards || []).map((cardData: unknown) => {
    const card = cardData as Record<string, unknown>;
    return {
      front: String(card.front || ''),
      back: String(card.back || ''),
      hint: card.hint ? String(card.hint) : undefined,
      mnemonic: card.mnemonic ? String(card.mnemonic) : undefined,
      visualCue: card.visualCue || card.visual_cue ? String(card.visualCue || card.visual_cue) : undefined,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
    };
  });

  return { lessons, flashcards };
}

/**
 * Generate additional flashcards for a specific lesson
 */
export async function generateFlashcardsForLesson(
  lessonContent: string,
  lessonTitle: string,
  existingCards: number = 0
): Promise<Omit<Flashcard, 'id' | 'createdAt' | 'lessonId'>[]> {
  const targetCards = Math.max(2, 5 - existingCards); // Generate up to 5 total cards

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.tokenLimits.generateFlashcards,
    messages: [
      {
        role: 'user',
        content: `Generate ${targetCards} flashcards for this lesson:

Title: ${lessonTitle}
Content: ${lessonContent}

Question Type Distribution:
- ~30% Definitional: "What is [term]?"
- ~30% Conceptual: "Why does [concept] work?"
- ~25% Application: "How would you apply...?"
- ~15% Procedural: "What are the steps to...?"

Return a JSON array of flashcard objects:
[
  {
    "front": "Question",
    "back": "Answer",
    "hint": "Semantic hint (connect to familiar concepts, NOT letter-based)",
    "mnemonic": "Optional memory aid",
    "visualCue": "Optional emoji"
  }
]

Make cards that test understanding, not just memorization. Return ONLY valid JSON.`,
      },
    ],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    let cards: Record<string, unknown>[];
    try {
      cards = JSON.parse(jsonMatch[0]);
    } catch {
      // Try to repair the JSON
      const repaired = repairJson(jsonMatch[0]);
      cards = JSON.parse(repaired);
    }

    return cards.map((card) => ({
      front: String(card.front || ''),
      back: String(card.back || ''),
      hint: card.hint ? String(card.hint) : undefined,
      mnemonic: card.mnemonic ? String(card.mnemonic) : undefined,
      visualCue: card.visualCue || card.visual_cue ? String(card.visualCue || card.visual_cue) : undefined,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
    }));
  } catch {
    console.error('Failed to parse flashcard response');
    return [];
  }
}

/**
 * Simplify complex text for better understanding
 */
export async function simplifyText(
  text: string,
  level: 'eli5' | 'simple' | 'standard' = 'simple'
): Promise<string> {
  const levelInstructions = {
    eli5: 'Explain like I\'m 5 years old. Use simple words, everyday analogies, and short sentences.',
    simple: 'Simplify for a general audience. Remove jargon, use clear language, keep it accessible.',
    standard: 'Keep technical accuracy but improve clarity. Define terms when first used.',
  };

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: AI_CONFIG.tokenLimits.simplifyText,
    messages: [
      {
        role: 'user',
        content: `${levelInstructions[level]}

Rewrite this text:
---
${text}
---

Return only the simplified text, no other commentary.`,
      },
    ],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
