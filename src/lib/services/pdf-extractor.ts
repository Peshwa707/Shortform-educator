// PDF Text Extraction Service
// Using unpdf for Node.js/serverless compatibility

import { extractText, getDocumentProxy, getMeta } from 'unpdf';

export interface ExtractedContent {
  text: string;
  pageCount: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  };
  pages: string[];
}

/**
 * Extract text content from a PDF buffer
 */
export async function extractPdfText(buffer: Buffer): Promise<ExtractedContent> {
  // Convert Buffer to Uint8Array
  const uint8Array = new Uint8Array(buffer);

  // Get the PDF document proxy
  const pdf = await getDocumentProxy(uint8Array);

  // Extract text from all pages
  const textResult = await extractText(pdf, { mergePages: false });

  // Get metadata
  const meta = await getMeta(pdf);

  const pages = Array.isArray(textResult.text) ? textResult.text : [textResult.text];
  const fullText = pages.join('\n\n');

  return {
    text: fullText,
    pageCount: textResult.totalPages,
    metadata: {
      title: meta.info?.Title as string | undefined,
      author: meta.info?.Author as string | undefined,
      subject: meta.info?.Subject as string | undefined,
      creator: meta.info?.Creator as string | undefined,
    },
    pages,
  };
}

/**
 * Clean extracted text for better AI processing
 * - Remove excessive whitespace
 * - Fix common OCR issues
 * - Normalize line breaks
 */
export function cleanExtractedText(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive blank lines (keep max 2)
      .replace(/\n{3,}/g, '\n\n')
      // Fix common OCR issues
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      .replace(/ﬀ/g, 'ff')
      .replace(/ﬃ/g, 'ffi')
      .replace(/ﬄ/g, 'ffl')
      // Remove page numbers (common patterns)
      .replace(/^\d+\s*$/gm, '')
      // Fix broken words at line ends (word- \n continuation)
      .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
      // Normalize whitespace within lines
      .replace(/[ \t]+/g, ' ')
      // Trim each line
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      // Final trim
      .trim()
  );
}

/**
 * Estimate reading time based on word count
 * Average adult reading speed: ~200-250 words per minute
 * For learning material, we use a slower rate: ~150 wpm
 */
export function estimateReadingTime(text: string): number {
  const wordCount = text.split(/\s+/).filter((word) => word.length > 0).length;
  const wordsPerMinute = 150; // Slower for learning material
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Detect chapter/section boundaries in text
 * Returns indices where major sections start
 */
export function detectSectionBoundaries(text: string): number[] {
  const boundaries: number[] = [0]; // Start of document

  // Common chapter/section patterns
  const patterns = [
    /^chapter\s+\d+/im,
    /^section\s+\d+/im,
    /^part\s+\d+/im,
    /^\d+\.\s+[A-Z]/m, // "1. Introduction"
    /^[IVXLCDM]+\.\s+/m, // Roman numerals
    /^#{1,3}\s+/m, // Markdown headers
  ];

  const lines = text.split('\n');
  let currentIndex = 0;

  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        boundaries.push(currentIndex);
        break;
      }
    }
    currentIndex += line.length + 1; // +1 for newline
  }

  return [...new Set(boundaries)].sort((a, b) => a - b);
}

/**
 * Extract title from text (first significant line or metadata)
 */
export function extractTitle(text: string, metadata?: { title?: string }): string {
  if (metadata?.title && metadata.title.trim()) {
    return metadata.title.trim();
  }

  // Find first significant line (not too short, not too long)
  const lines = text.split('\n').filter((line) => line.trim().length > 0);

  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    if (trimmed.length >= 5 && trimmed.length <= 100) {
      // Likely a title if it's capitalized or short
      if (/^[A-Z]/.test(trimmed) || trimmed.length < 50) {
        return trimmed;
      }
    }
  }

  return 'Untitled Document';
}
