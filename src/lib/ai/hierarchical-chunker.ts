// Hierarchical Document Chunker
// Segments long documents respecting natural boundaries for multi-pass summarization

import { DocumentSegment, DEFAULT_SUMMARIZATION_CONFIG } from '@/types/summaries';
// Note: detectSectionBoundaries from pdf-extractor could be used for PDF-specific boundary detection
// Currently using our own detectStructure for general text handling

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for text
 * Using approximation: ~4 characters per token for English text
 * This is conservative - actual count may be lower
 */
export function estimateTokens(text: string): number {
  // More accurate estimation based on common patterns
  // - Words: ~1.3 tokens per word on average
  // - Punctuation and whitespace add ~10%
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const punctuation = (text.match(/[.,!?;:'"()\[\]{}]/g) || []).length;

  return Math.ceil(words * 1.3 + punctuation * 0.5);
}

/**
 * Estimate character count for a target token count
 */
export function tokensToChars(tokens: number): number {
  return tokens * 4; // ~4 chars per token
}

// ============================================================================
// Structure Detection
// ============================================================================

interface DetectedStructure {
  boundaries: number[];
  titles: Map<number, string>;
  levels: Map<number, number>;
}

/**
 * Detect document structure including section titles and hierarchy levels
 * Extends pdf-extractor's detectSectionBoundaries with title extraction
 */
export function detectStructure(text: string): DetectedStructure {
  const boundaries: number[] = [0];
  const titles = new Map<number, string>();
  const levels = new Map<number, number>();

  // Patterns with capture groups for titles and level detection
  const patterns: Array<{ pattern: RegExp; level: number }> = [
    { pattern: /^(chapter\s+\d+[:\s]*(.*))/im, level: 1 },
    { pattern: /^(part\s+\d+[:\s]*(.*))/im, level: 0 },
    { pattern: /^(section\s+\d+[:\s]*(.*))/im, level: 2 },
    { pattern: /^(\d+\.\s+([A-Z].*))/m, level: 2 },
    { pattern: /^(\d+\.\d+\s+(.*))/m, level: 3 },
    { pattern: /^([IVXLCDM]+\.\s+(.*))/m, level: 1 },
    { pattern: /^(#{1}\s+(.*))/m, level: 1 },
    { pattern: /^(#{2}\s+(.*))/m, level: 2 },
    { pattern: /^(#{3}\s+(.*))/m, level: 3 },
    { pattern: /^(#{4,}\s+(.*))/m, level: 4 },
    // All caps headers (common in PDFs)
    { pattern: /^([A-Z][A-Z\s]{10,}[A-Z])$/m, level: 2 },
  ];

  const lines = text.split('\n');
  let currentIndex = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    for (const { pattern, level } of patterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        boundaries.push(currentIndex);
        // Extract title - use captured group or the whole match
        const title = (match[2] || match[1]).trim().replace(/^#+\s*/, '');
        titles.set(currentIndex, title);
        levels.set(currentIndex, level);
        break;
      }
    }

    currentIndex += line.length + 1; // +1 for newline
  }

  return {
    boundaries: [...new Set(boundaries)].sort((a, b) => a - b),
    titles,
    levels,
  };
}

// ============================================================================
// Document Segmentation
// ============================================================================

export interface SegmentOptions {
  maxTokensPerSegment?: number;
  respectSectionBoundaries?: boolean;
  overlapTokens?: number;
}

const DEFAULT_OPTIONS: Required<SegmentOptions> = {
  maxTokensPerSegment: DEFAULT_SUMMARIZATION_CONFIG.maxSegmentTokens,
  respectSectionBoundaries: true,
  overlapTokens: 100, // Small overlap for context continuity
};

/**
 * Segment a document into chunks suitable for summarization
 * Respects natural section boundaries when possible
 */
export function segmentDocument(
  text: string,
  sourceId: string,
  options: SegmentOptions = {}
): Omit<DocumentSegment, 'id' | 'createdAt'>[] {
  // Handle empty or whitespace-only documents
  if (!text || text.trim().length === 0) {
    return [];
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const segments: Omit<DocumentSegment, 'id' | 'createdAt'>[] = [];

  // Detect document structure
  const structure = detectStructure(text);

  // If document is small enough, return as single segment
  const totalTokens = estimateTokens(text);
  if (totalTokens <= opts.maxTokensPerSegment) {
    return [{
      sourceId,
      segmentIndex: 0,
      startIndex: 0,
      endIndex: text.length,
      sectionTitle: structure.titles.get(0) || undefined,
      level: structure.levels.get(0) || 0,
      estimatedTokens: totalTokens,
      text,
    }];
  }

  // Process sections based on detected boundaries
  if (opts.respectSectionBoundaries && structure.boundaries.length > 1) {
    segments.push(...segmentBySections(text, sourceId, structure, opts));
  } else {
    segments.push(...segmentBySize(text, sourceId, opts));
  }

  return segments;
}

/**
 * Segment document respecting section boundaries
 * Merges small sections, splits large ones
 */
function segmentBySections(
  text: string,
  sourceId: string,
  structure: DetectedStructure,
  opts: Required<SegmentOptions>
): Omit<DocumentSegment, 'id' | 'createdAt'>[] {
  const segments: Omit<DocumentSegment, 'id' | 'createdAt'>[] = [];
  const { boundaries, titles, levels } = structure;

  let segmentIndex = 0;
  let pendingText = '';
  let pendingStart = 0;
  let pendingTitle: string | undefined;
  let pendingLevel = 0;

  for (let i = 0; i < boundaries.length; i++) {
    const sectionStart = boundaries[i];
    const sectionEnd = boundaries[i + 1] || text.length;
    const sectionText = text.slice(sectionStart, sectionEnd);
    const sectionTokens = estimateTokens(sectionText);
    const sectionTitle = titles.get(sectionStart);
    const sectionLevel = levels.get(sectionStart) || 0;

    // If section is too large, split it further
    if (sectionTokens > opts.maxTokensPerSegment) {
      // First, flush any pending content
      if (pendingText) {
        segments.push({
          sourceId,
          segmentIndex: segmentIndex++,
          startIndex: pendingStart,
          endIndex: sectionStart,
          sectionTitle: pendingTitle,
          level: pendingLevel,
          estimatedTokens: estimateTokens(pendingText),
          text: pendingText,
        });
        pendingText = '';
      }

      // Split large section by size
      const subSegments = segmentBySize(sectionText, sourceId, opts, segmentIndex, sectionStart);
      for (const subSeg of subSegments) {
        segments.push({
          ...subSeg,
          sectionTitle: subSeg.sectionTitle || sectionTitle,
          level: Math.max(subSeg.level, sectionLevel),
        });
        segmentIndex++;
      }
      continue;
    }

    // Check if adding this section would exceed limit
    const combinedTokens = estimateTokens(pendingText + sectionText);

    if (combinedTokens > opts.maxTokensPerSegment && pendingText) {
      // Flush pending content as a segment
      segments.push({
        sourceId,
        segmentIndex: segmentIndex++,
        startIndex: pendingStart,
        endIndex: sectionStart,
        sectionTitle: pendingTitle,
        level: pendingLevel,
        estimatedTokens: estimateTokens(pendingText),
        text: pendingText,
      });

      // Start new pending with current section
      pendingText = sectionText;
      pendingStart = sectionStart;
      pendingTitle = sectionTitle;
      pendingLevel = sectionLevel;
    } else {
      // Accumulate section into pending
      if (!pendingText) {
        pendingStart = sectionStart;
        pendingTitle = sectionTitle;
        pendingLevel = sectionLevel;
      }
      pendingText += sectionText;
    }
  }

  // Flush remaining pending content
  if (pendingText) {
    segments.push({
      sourceId,
      segmentIndex: segmentIndex++,
      startIndex: pendingStart,
      endIndex: text.length,
      sectionTitle: pendingTitle,
      level: pendingLevel,
      estimatedTokens: estimateTokens(pendingText),
      text: pendingText,
    });
  }

  return segments;
}

/**
 * Segment document by size only, trying to break at paragraph boundaries
 */
function segmentBySize(
  text: string,
  sourceId: string,
  opts: Required<SegmentOptions>,
  startIndex: number = 0,
  offsetInDocument: number = 0
): Omit<DocumentSegment, 'id' | 'createdAt'>[] {
  const segments: Omit<DocumentSegment, 'id' | 'createdAt'>[] = [];
  const maxChars = tokensToChars(opts.maxTokensPerSegment);

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/);

  let segmentIndex = startIndex;
  let currentSegmentText = '';
  let currentSegmentStart = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraWithBreak = para + '\n\n';

    // Check if adding paragraph would exceed limit
    if (currentSegmentText.length + paraWithBreak.length > maxChars && currentSegmentText) {
      // Save current segment
      const segmentText = currentSegmentText.trim();
      segments.push({
        sourceId,
        segmentIndex: segmentIndex++,
        startIndex: offsetInDocument + currentSegmentStart,
        endIndex: offsetInDocument + currentSegmentStart + segmentText.length,
        level: 0,
        estimatedTokens: estimateTokens(segmentText),
        text: segmentText,
      });

      // Start new segment
      currentSegmentStart = currentSegmentStart + currentSegmentText.length;
      currentSegmentText = paraWithBreak;
    } else {
      currentSegmentText += paraWithBreak;
    }
  }

  // Handle remaining text
  if (currentSegmentText.trim()) {
    const segmentText = currentSegmentText.trim();
    segments.push({
      sourceId,
      segmentIndex: segmentIndex,
      startIndex: offsetInDocument + currentSegmentStart,
      endIndex: offsetInDocument + currentSegmentStart + segmentText.length,
      level: 0,
      estimatedTokens: estimateTokens(segmentText),
      text: segmentText,
    });
  }

  return segments;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get word count from text
 */
export function getWordCount(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Truncate text to a target token count, respecting word boundaries
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Estimate how many characters we need
  const ratio = maxTokens / currentTokens;
  const targetChars = Math.floor(text.length * ratio * 0.95); // 5% buffer

  // Find the last complete sentence within the limit
  const truncated = text.slice(0, targetChars);
  const lastSentence = truncated.lastIndexOf('. ');

  if (lastSentence > targetChars * 0.5) {
    return truncated.slice(0, lastSentence + 1);
  }

  // Fall back to last word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace);
}
