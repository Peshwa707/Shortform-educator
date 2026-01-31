// Multi-Level Summarization Service
// Generates hierarchical summaries: executive, key_points, detailed, segment

import Anthropic from '@anthropic-ai/sdk';
import { AI_CONFIG } from '@/config/ai-config';
import {
  Summary,
  SummaryType,
  DocumentSegment,
  HierarchicalSummaryResult,
  DEFAULT_SUMMARIZATION_CONFIG,
  SummarizationConfig,
  CreateSummaryInput,
} from '@/types/summaries';
import { segmentDocument, estimateTokens, getWordCount } from './hierarchical-chunker';

const anthropic = new Anthropic();

// ============================================================================
// Configuration
// ============================================================================

const SUMMARIZATION_CONFIG: SummarizationConfig = DEFAULT_SUMMARIZATION_CONFIG;

// ============================================================================
// Prompts
// ============================================================================

const SEGMENT_SUMMARY_PROMPT = `You are an expert summarizer. Create a detailed summary of this document segment.

Focus on:
- Main concepts and ideas
- Key facts, statistics, and examples
- Important definitions
- Relationships between concepts
- Any conclusions or recommendations

Guidelines:
- Be comprehensive but concise
- Preserve important details that might be lost in higher-level summaries
- Use clear, structured formatting with bullet points or numbered lists
- Maintain the original meaning and nuance
- Include any domain-specific terminology with brief explanations`;

const KEY_POINTS_PROMPT = `You are an expert at synthesizing information. Create a key points summary from the provided section summaries.

Your task:
- Extract 10-15 key points from all the summaries
- Identify the most important concepts, insights, and takeaways
- Remove redundancy while preserving unique insights
- Organize points logically (thematic grouping preferred)
- Each point should be self-contained and understandable without context

Format each key point as:
- **[Brief Label]**: [1-2 sentence explanation]

Focus on what matters most - what would someone NEED to know?`;

const EXECUTIVE_SUMMARY_PROMPT = `You are an executive communication expert. Create a concise executive summary from the provided key points.

Requirements:
- 2-3 paragraphs maximum (150-250 words)
- Start with the most important insight or conclusion
- Highlight critical information that drives decisions
- Use clear, professional language
- End with implications or next steps if relevant

This summary should answer: "What's the essential takeaway in under 2 minutes?"`;

const DETAILED_SUMMARY_PROMPT = `You are an expert technical writer. Create a comprehensive detailed summary that preserves the depth of the original content.

Structure:
1. **Overview** (2-3 sentences)
2. **Main Sections** (preserve document structure, summarize each major section)
3. **Key Concepts** (define and explain important terms/ideas)
4. **Supporting Details** (important examples, data, evidence)
5. **Conclusions** (findings, recommendations, implications)

Guidelines:
- Target 500-1000 words depending on source length
- Maintain logical flow and structure
- Include specific details that matter
- Use formatting (headers, bullets, bold) for readability`;

// ============================================================================
// Summary Generation Functions
// ============================================================================

interface SummaryGenerationResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

/**
 * Generate a summary for a single document segment
 */
export async function generateSegmentSummary(
  segment: Omit<DocumentSegment, 'id' | 'createdAt'>,
  sourceTitle: string
): Promise<SummaryGenerationResult> {
  // Input validation
  if (!sourceTitle || typeof sourceTitle !== 'string') {
    throw new Error('sourceTitle is required and must be a string');
  }
  if (!segment.text || typeof segment.text !== 'string' || segment.text.trim().length === 0) {
    throw new Error(`Segment ${segment.segmentIndex} has no text content`);
  }

  const startTime = Date.now();

  const userPrompt = `Document: "${sourceTitle}"
${segment.sectionTitle ? `Section: "${segment.sectionTitle}"` : ''}

Content to summarize:
---
${segment.text}
---

Create a detailed summary of this segment.`;

  try {
    const response = await anthropic.messages.create({
      model: AI_CONFIG.model,
      max_tokens: SUMMARIZATION_CONFIG.segmentSummaryTokens,
      system: SEGMENT_SUMMARY_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to generate segment summary: ${err.message}`);
  }
}

/**
 * Synthesize section summaries into key points
 */
export async function generateKeyPointsSummary(
  segmentSummaries: string[],
  sourceTitle: string
): Promise<SummaryGenerationResult> {
  // Input validation
  if (!sourceTitle || typeof sourceTitle !== 'string') {
    throw new Error('sourceTitle is required and must be a string');
  }
  if (!segmentSummaries || segmentSummaries.length === 0) {
    throw new Error('At least one segment summary is required');
  }

  const startTime = Date.now();

  const combinedSummaries = segmentSummaries
    .map((summary, i) => `### Section ${i + 1}\n${summary}`)
    .join('\n\n');

  const userPrompt = `Document: "${sourceTitle}"

Section Summaries:
${combinedSummaries}

---

Extract and synthesize 10-15 key points from these section summaries.`;

  try {
    const response = await anthropic.messages.create({
      model: AI_CONFIG.model,
      max_tokens: SUMMARIZATION_CONFIG.keyPointsOutputTokens,
      system: KEY_POINTS_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to generate key points summary: ${err.message}`);
  }
}

/**
 * Generate executive summary from key points
 */
export async function generateExecutiveSummary(
  keyPointsSummary: string,
  sourceTitle: string
): Promise<SummaryGenerationResult> {
  // Input validation
  if (!sourceTitle || typeof sourceTitle !== 'string') {
    throw new Error('sourceTitle is required and must be a string');
  }
  if (!keyPointsSummary || typeof keyPointsSummary !== 'string' || keyPointsSummary.trim().length === 0) {
    throw new Error('keyPointsSummary is required and must be non-empty');
  }

  const startTime = Date.now();

  const userPrompt = `Document: "${sourceTitle}"

Key Points:
${keyPointsSummary}

---

Create a concise executive summary (2-3 paragraphs, 150-250 words).`;

  try {
    const response = await anthropic.messages.create({
      model: AI_CONFIG.model,
      max_tokens: SUMMARIZATION_CONFIG.executiveOutputTokens,
      system: EXECUTIVE_SUMMARY_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to generate executive summary: ${err.message}`);
  }
}

/**
 * Generate detailed summary from segment summaries
 */
export async function generateDetailedSummary(
  segmentSummaries: string[],
  sourceTitle: string
): Promise<SummaryGenerationResult> {
  // Input validation
  if (!sourceTitle || typeof sourceTitle !== 'string') {
    throw new Error('sourceTitle is required and must be a string');
  }
  if (!segmentSummaries || segmentSummaries.length === 0) {
    throw new Error('At least one segment summary is required');
  }

  const startTime = Date.now();

  const combinedSummaries = segmentSummaries
    .map((summary, i) => `### Section ${i + 1}\n${summary}`)
    .join('\n\n');

  const userPrompt = `Document: "${sourceTitle}"

Section Summaries:
${combinedSummaries}

---

Create a comprehensive detailed summary that preserves the depth of the original content.`;

  try {
    const response = await anthropic.messages.create({
      model: AI_CONFIG.model,
      max_tokens: AI_CONFIG.summarization.detailedOutputTokens,
      system: DETAILED_SUMMARY_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const err = error as Error;
    throw new Error(`Failed to generate detailed summary: ${err.message}`);
  }
}

// ============================================================================
// Orchestration
// ============================================================================

export interface GenerateHierarchicalSummariesOptions {
  sourceId: string;
  sourceTitle: string;
  text: string;
  onProgress?: (progress: {
    phase: string;
    current: number;
    total: number;
    percent: number;
  }) => void;
}

/**
 * Generate all summary levels for a document
 * Returns prepared summary inputs (without IDs) for database storage
 */
export async function generateHierarchicalSummaries(
  options: GenerateHierarchicalSummariesOptions
): Promise<{
  segments: Omit<DocumentSegment, 'id' | 'createdAt'>[];
  summaries: CreateSummaryInput[];
}> {
  const { sourceId, sourceTitle, text, onProgress } = options;

  // Phase 1: Segment the document
  onProgress?.({ phase: 'Segmenting document', current: 0, total: 4, percent: 5 });

  const segments = segmentDocument(text, sourceId);
  const totalSteps = segments.length + 3; // segments + key_points + executive + detailed

  // Phase 2: Generate segment summaries
  const segmentSummaries: CreateSummaryInput[] = [];
  const segmentTexts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    onProgress?.({
      phase: `Summarizing segment ${i + 1}/${segments.length}`,
      current: i + 1,
      total: totalSteps,
      percent: Math.round(((i + 1) / totalSteps) * 80),
    });

    const result = await generateSegmentSummary(segments[i], sourceTitle);
    segmentTexts.push(result.content);

    segmentSummaries.push({
      sourceId,
      summaryType: 'segment' as SummaryType,
      title: segments[i].sectionTitle || `Segment ${i + 1}`,
      content: result.content,
      wordCount: getWordCount(result.content),
      generationModel: AI_CONFIG.model,
      generationDurationMs: result.durationMs,
      inputTokenCount: result.inputTokens,
      outputTokenCount: result.outputTokens,
    });
  }

  // Phase 3: Generate key points summary
  onProgress?.({
    phase: 'Generating key points',
    current: segments.length + 1,
    total: totalSteps,
    percent: 85,
  });

  const keyPointsResult = await generateKeyPointsSummary(segmentTexts, sourceTitle);
  const keyPointsSummary: CreateSummaryInput = {
    sourceId,
    summaryType: 'key_points' as SummaryType,
    title: `Key Points: ${sourceTitle}`,
    content: keyPointsResult.content,
    wordCount: getWordCount(keyPointsResult.content),
    generationModel: AI_CONFIG.model,
    generationDurationMs: keyPointsResult.durationMs,
    inputTokenCount: keyPointsResult.inputTokens,
    outputTokenCount: keyPointsResult.outputTokens,
  };

  // Phase 4: Generate executive summary
  onProgress?.({
    phase: 'Generating executive summary',
    current: segments.length + 2,
    total: totalSteps,
    percent: 92,
  });

  const executiveResult = await generateExecutiveSummary(keyPointsResult.content, sourceTitle);
  const executiveSummary: CreateSummaryInput = {
    sourceId,
    summaryType: 'executive' as SummaryType,
    title: `Executive Summary: ${sourceTitle}`,
    content: executiveResult.content,
    wordCount: getWordCount(executiveResult.content),
    generationModel: AI_CONFIG.model,
    generationDurationMs: executiveResult.durationMs,
    inputTokenCount: executiveResult.inputTokens,
    outputTokenCount: executiveResult.outputTokens,
  };

  // Phase 5: Generate detailed summary
  onProgress?.({
    phase: 'Generating detailed summary',
    current: segments.length + 3,
    total: totalSteps,
    percent: 97,
  });

  const detailedResult = await generateDetailedSummary(segmentTexts, sourceTitle);
  const detailedSummary: CreateSummaryInput = {
    sourceId,
    summaryType: 'detailed' as SummaryType,
    title: `Detailed Summary: ${sourceTitle}`,
    content: detailedResult.content,
    wordCount: getWordCount(detailedResult.content),
    generationModel: AI_CONFIG.model,
    generationDurationMs: detailedResult.durationMs,
    inputTokenCount: detailedResult.inputTokens,
    outputTokenCount: detailedResult.outputTokens,
  };

  onProgress?.({ phase: 'Complete', current: totalSteps, total: totalSteps, percent: 100 });

  return {
    segments,
    summaries: [executiveSummary, keyPointsSummary, detailedSummary, ...segmentSummaries],
  };
}

// ============================================================================
// Single Summary Generation
// ============================================================================

/**
 * Generate a single summary type for a source
 * Useful for regenerating specific summary levels
 */
export async function generateSingleSummary(
  sourceId: string,
  sourceTitle: string,
  text: string,
  summaryType: SummaryType
): Promise<CreateSummaryInput> {
  const startTime = Date.now();

  let content: string;
  let inputTokens: number;
  let outputTokens: number;

  // For executive/key_points/detailed, we need to segment first
  if (summaryType !== 'segment') {
    const segments = segmentDocument(text, sourceId);
    const segmentTexts: string[] = [];

    // Generate segment summaries
    for (const segment of segments) {
      const result = await generateSegmentSummary(segment, sourceTitle);
      segmentTexts.push(result.content);
    }

    switch (summaryType) {
      case 'executive': {
        const keyPointsResult = await generateKeyPointsSummary(segmentTexts, sourceTitle);
        const execResult = await generateExecutiveSummary(keyPointsResult.content, sourceTitle);
        content = execResult.content;
        inputTokens = execResult.inputTokens;
        outputTokens = execResult.outputTokens;
        break;
      }
      case 'key_points': {
        const result = await generateKeyPointsSummary(segmentTexts, sourceTitle);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        break;
      }
      case 'detailed': {
        const result = await generateDetailedSummary(segmentTexts, sourceTitle);
        content = result.content;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        break;
      }
      default:
        throw new Error(`Unknown summary type: ${summaryType}`);
    }
  } else {
    // Single segment - summarize the whole text
    const result = await generateSegmentSummary(
      {
        sourceId,
        segmentIndex: 0,
        startIndex: 0,
        endIndex: text.length,
        level: 0,
        estimatedTokens: estimateTokens(text),
        text,
      },
      sourceTitle
    );
    content = result.content;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
  }

  return {
    sourceId,
    summaryType,
    title: `${summaryType.charAt(0).toUpperCase() + summaryType.slice(1).replace('_', ' ')}: ${sourceTitle}`,
    content,
    wordCount: getWordCount(content),
    generationModel: AI_CONFIG.model,
    generationDurationMs: Date.now() - startTime,
    inputTokenCount: inputTokens,
    outputTokenCount: outputTokens,
  };
}
