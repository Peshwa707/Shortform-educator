// Cross-Source Summary Aggregation Service
// Combines summaries from multiple sources into unified insights

import Anthropic from '@anthropic-ai/sdk';
import { AI_CONFIG } from '@/config/ai-config';
import {
  Summary,
  SummaryType,
  AggregatedSummary,
  AggregationOptions,
  DEFAULT_AGGREGATION_OPTIONS,
  CreateSummaryInput,
} from '@/types/summaries';
import { getWordCount } from './hierarchical-chunker';

const anthropic = new Anthropic();

// ============================================================================
// Prompts
// ============================================================================

const AGGREGATE_SUMMARIES_PROMPT = `You are an expert at synthesizing information from multiple sources. Create a unified summary that:

1. Identifies common themes and patterns across sources
2. Highlights unique insights from each source
3. Resolves any contradictions or differences in perspective
4. Organizes information logically by theme, not by source
5. Removes redundancy while preserving important nuances

Guidelines:
- Focus on what matters most across all sources
- Note when sources agree or disagree on key points
- Preserve attribution when insights are source-specific
- Create a coherent narrative, not just a compilation`;

const FIND_THEMES_PROMPT = `You are an expert at identifying patterns across documents. Analyze the provided summaries and:

1. Identify 5-10 major themes that appear across multiple sources
2. Note which sources contribute to each theme
3. Rank themes by importance/frequency

Return a JSON array of themes:
[
  {
    "theme": "Theme name",
    "description": "Brief description of the theme",
    "sourceCount": number,
    "importance": "high" | "medium" | "low"
  }
]

Return ONLY valid JSON.`;

const EXTRACT_INSIGHTS_PROMPT = `You are an expert at finding unique value in documents. Analyze the provided summaries and:

1. Identify insights that appear in only one source
2. Find perspectives or approaches unique to specific sources
3. Note any novel information not covered elsewhere

Return a JSON array of unique insights:
[
  {
    "sourceIndex": 0,
    "insight": "The unique insight or finding",
    "significance": "Why this matters"
  }
]

Return ONLY valid JSON.`;

// ============================================================================
// Core Aggregation Functions
// ============================================================================

interface AggregationInput {
  summaries: Summary[];
  collectionName: string;
  collectionId: string;
  options?: Partial<AggregationOptions>;
}

/**
 * Aggregate multiple source summaries into a unified summary
 */
export async function aggregateSummaries(
  input: AggregationInput
): Promise<CreateSummaryInput> {
  const { summaries, collectionName, options: userOptions } = input;

  // Input validation
  if (!summaries || summaries.length === 0) {
    throw new Error('At least one summary is required for aggregation');
  }
  if (!collectionName || typeof collectionName !== 'string') {
    throw new Error('collectionName is required and must be a string');
  }

  const options = { ...DEFAULT_AGGREGATION_OPTIONS, ...userOptions };
  const startTime = Date.now();

  // Sort and potentially weight summaries
  let processedSummaries = [...summaries];

  if (options.weightByRecency) {
    // Handle both Date objects and date strings
    const getTime = (d: Date | string): number => {
      if (d instanceof Date) return d.getTime();
      return new Date(d).getTime();
    };
    processedSummaries.sort((a, b) =>
      getTime(b.createdAt) - getTime(a.createdAt)
    );
  }

  // Build combined input for aggregation
  const summaryTexts = processedSummaries.map((s, i) => {
    const sourceLabel = options.includeSourceAttribution
      ? `\n[Source ${i + 1}: ${s.title}]`
      : '';
    return `### Source ${i + 1}${sourceLabel}\n${s.content}`;
  }).join('\n\n---\n\n');

  const userPrompt = `Collection: "${collectionName}"
Number of Sources: ${summaries.length}

Summaries to aggregate:
${summaryTexts}

---

Create a unified summary that synthesizes these ${summaries.length} sources.
Target ${options.maxKeyPoints} key points.
${options.includeSourceAttribution ? 'Include source attribution where relevant.' : ''}`;

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 3000,
    system: AGGREGATE_SUMMARIES_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    sourceId: input.collectionId, // Use collection ID as source
    summaryType: 'key_points' as SummaryType,
    title: `Aggregated: ${collectionName}`,
    content,
    wordCount: getWordCount(content),
    generationModel: AI_CONFIG.model,
    generationDurationMs: Date.now() - startTime,
    inputTokenCount: response.usage.input_tokens,
    outputTokenCount: response.usage.output_tokens,
  };
}

/**
 * Find common themes across multiple summaries
 */
export async function findCommonThemes(
  summaries: Summary[]
): Promise<{ theme: string; description: string; sourceCount: number; importance: 'high' | 'medium' | 'low' }[]> {
  const summaryTexts = summaries.map((s, i) =>
    `### Source ${i + 1}: ${s.title}\n${s.content}`
  ).join('\n\n---\n\n');

  const userPrompt = `Analyze these ${summaries.length} summaries and identify common themes:

${summaryTexts}

---

Identify 5-10 major themes that appear across multiple sources.`;

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 1500,
    system: FIND_THEMES_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error('Failed to parse themes response');
    return [];
  }
}

/**
 * Extract unique insights from each source
 */
export async function extractUniqueInsights(
  summaries: Summary[]
): Promise<{ sourceId: string; insight: string; significance: string }[]> {
  const summaryTexts = summaries.map((s, i) =>
    `### Source ${i + 1}: ${s.title}\n${s.content}`
  ).join('\n\n---\n\n');

  const userPrompt = `Analyze these ${summaries.length} summaries and find unique insights:

${summaryTexts}

---

Identify insights that appear in only one source.`;

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 1500,
    system: EXTRACT_INSIGHTS_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      sourceIndex: number;
      insight: string;
      significance: string;
    }>;

    // Map source indices to source IDs with bounds validation
    return parsed
      .filter(item => {
        // Validate sourceIndex is within bounds
        const validIndex = typeof item.sourceIndex === 'number' &&
                          item.sourceIndex >= 0 &&
                          item.sourceIndex < summaries.length;
        if (!validIndex) {
          console.warn(`Invalid sourceIndex ${item.sourceIndex} in insights response (max: ${summaries.length - 1})`);
        }
        return validIndex;
      })
      .map(item => ({
        sourceId: summaries[item.sourceIndex].sourceId,
        insight: item.insight,
        significance: item.significance,
      }));
  } catch {
    console.error('Failed to parse insights response');
    return [];
  }
}

// ============================================================================
// Full Aggregation Pipeline
// ============================================================================

/**
 * Generate a complete aggregated summary with themes and unique insights
 */
export async function generateAggregatedSummary(
  input: AggregationInput
): Promise<AggregatedSummary> {
  const { summaries } = input;

  // Run aggregation, themes, and insights in parallel
  const [aggregatedSummary, themes, insights] = await Promise.all([
    aggregateSummaries(input),
    findCommonThemes(summaries),
    extractUniqueInsights(summaries),
  ]);

  return {
    summary: {
      ...aggregatedSummary,
      id: '', // Will be set when saved to DB
      version: 1,
      isCurrent: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    commonThemes: themes.map(t => `${t.theme}: ${t.description}`),
    uniqueInsights: insights,
    sourceSummaries: summaries,
  };
}

// ============================================================================
// Concept Deduplication
// ============================================================================

/**
 * Normalize a concept for deduplication
 * Handles variations in casing, pluralization, and common abbreviations
 */
export function normalizeConcept(concept: string): string {
  return concept
    .toLowerCase()
    .trim()
    // Remove common variations
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    // Handle plurals
    .replace(/ies$/, 'y')
    .replace(/s$/, '')
    // Common abbreviations
    .replace(/\bai\b/g, 'artificial intelligence')
    .replace(/\bml\b/g, 'machine learning')
    .replace(/\bapi\b/g, 'application programming interface');
}

/**
 * Find duplicate concepts across summaries
 */
export function findDuplicateConcepts(
  concepts: { concept: string; summaryId: string }[]
): Map<string, string[]> {
  const normalized = new Map<string, string[]>();

  for (const { concept, summaryId } of concepts) {
    const norm = normalizeConcept(concept);
    const existing = normalized.get(norm) || [];
    if (!existing.includes(summaryId)) {
      existing.push(summaryId);
    }
    normalized.set(norm, existing);
  }

  // Filter to only return concepts that appear in multiple summaries
  const duplicates = new Map<string, string[]>();
  for (const [norm, summaryIds] of normalized) {
    if (summaryIds.length > 1) {
      duplicates.set(norm, summaryIds);
    }
  }

  return duplicates;
}

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Compare two summaries and highlight differences
 */
export async function compareSummaries(
  summary1: Summary,
  summary2: Summary
): Promise<{
  agreements: string[];
  disagreements: string[];
  unique1: string[];
  unique2: string[];
}> {
  const prompt = `Compare these two summaries and identify:
1. Points of agreement
2. Points of disagreement or contradiction
3. Unique points in Summary 1 only
4. Unique points in Summary 2 only

Summary 1 (${summary1.title}):
${summary1.content}

Summary 2 (${summary2.title}):
${summary2.content}

Return a JSON object:
{
  "agreements": ["Point 1", "Point 2"],
  "disagreements": ["Difference 1", "Difference 2"],
  "unique1": ["Unique to Summary 1"],
  "unique2": ["Unique to Summary 2"]
}

Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: AI_CONFIG.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { agreements: [], disagreements: [], unique1: [], unique2: [] };
    }
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error('Failed to parse comparison response');
    return { agreements: [], disagreements: [], unique1: [], unique2: [] };
  }
}
