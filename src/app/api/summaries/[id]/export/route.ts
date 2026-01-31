// API route for exporting summaries
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getSummary,
  createExport,
  incrementExportDownloadCount,
} from '@/lib/db/client';
import { ExportFormat } from '@/types/summaries';

// POST /api/summaries/[id]/export - Export a summary
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;

    const summary = await getSummary(id);
    if (!summary) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    // Safe JSON parsing with error handling
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { format = 'markdown', includeMetadata = true } = body;

    // Validate format
    const validFormats: ExportFormat[] = ['markdown', 'pdf', 'anki'];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { error: `Invalid format. Must be one of: ${validFormats.join(', ')}` },
        { status: 400 }
      );
    }

    let content: string;
    let contentType: string;
    let filename: string;

    // Handle PDF separately (early return)
    if (format === 'pdf') {
      return NextResponse.json(
        { error: 'PDF export not yet implemented. Use markdown instead.' },
        { status: 501 }
      );
    }

    // Handle other formats
    if (format === 'anki') {
      content = generateAnkiCards(summary);
      contentType = 'text/csv';
      filename = `${sanitizeFilename(summary.title)}-anki.csv`;
    } else {
      // Default to markdown
      content = generateMarkdown(summary, includeMetadata);
      contentType = 'text/markdown';
      filename = `${sanitizeFilename(summary.title)}.md`;
    }

    // Record the export
    await createExport({
      summaryId: id,
      exportFormat: format,
    });

    // Return the file
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting summary:', error);
    return NextResponse.json(
      { error: 'Failed to export summary' },
      { status: 500 }
    );
  }
}

/**
 * Generate markdown content from a summary
 */
function generateMarkdown(
  summary: { title: string; content: string; summaryType: string; createdAt: Date; generationModel: string; wordCount: number },
  includeMetadata: boolean
): string {
  let md = `# ${summary.title}\n\n`;

  if (includeMetadata) {
    md += `---\n`;
    md += `Type: ${summary.summaryType}\n`;
    md += `Generated: ${summary.createdAt.toISOString()}\n`;
    md += `Model: ${summary.generationModel}\n`;
    md += `Word Count: ${summary.wordCount}\n`;
    md += `---\n\n`;
  }

  md += summary.content;

  return md;
}

/**
 * Generate Anki-compatible CSV from a summary
 * Uses key points or bullet items as flashcard fronts
 */
function generateAnkiCards(
  summary: { content: string; title: string }
): string {
  // Parse bullet points or key points from the content
  const lines = summary.content.split('\n');
  const cards: Array<{ front: string; back: string }> = [];

  let currentSection = summary.title;

  for (const line of lines) {
    const trimmed = line.trim();

    // Update current section on headers
    if (trimmed.startsWith('##')) {
      currentSection = trimmed.replace(/^#+\s*/, '');
      continue;
    }

    // Extract bullet points with bold labels as Q&A pairs
    const boldLabelMatch = trimmed.match(/^[-*]\s*\*\*([^*]+)\*\*[:\s]*(.+)/);
    if (boldLabelMatch) {
      cards.push({
        front: `What is ${boldLabelMatch[1]}?`,
        back: boldLabelMatch[2].trim(),
      });
      continue;
    }

    // Extract numbered items as questions
    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numberedMatch && numberedMatch[1].length > 20) {
      cards.push({
        front: `What is key point about ${currentSection}?`,
        back: numberedMatch[1],
      });
    }
  }

  // Generate CSV (Anki format: front;back)
  const header = 'front;back\n';
  const rows = cards.map(card =>
    `"${escapeCSV(card.front)}";"${escapeCSV(card.back)}"`
  ).join('\n');

  return header + rows;
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

/**
 * Escape a string for CSV
 */
function escapeCSV(str: string): string {
  return str.replace(/"/g, '""');
}
