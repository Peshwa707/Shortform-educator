// API routes for summaries - list and generate
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getSource,
  getSummariesBySource,
  createSummaries,
  createDocumentSegments,
  deleteDocumentSegments,
} from '@/lib/db/client';
import { generateHierarchicalSummaries } from '@/lib/ai/summarizer';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  RateLimitConfigs,
} from '@/lib/rate-limiter';
import { SummaryType } from '@/types/summaries';

// Valid summary types for validation
const VALID_SUMMARY_TYPES: SummaryType[] = ['executive', 'key_points', 'detailed', 'segment'];

// GET /api/summaries - List summaries with optional filters
export async function GET(request: NextRequest) {
  try {
    await initializeDb();
    const { searchParams } = new URL(request.url);

    const sourceId = searchParams.get('sourceId');
    const rawSummaryType = searchParams.get('summaryType');
    // Validate summaryType before casting
    const summaryType: SummaryType | null = rawSummaryType && VALID_SUMMARY_TYPES.includes(rawSummaryType as SummaryType)
      ? rawSummaryType as SummaryType
      : null;
    const currentOnly = searchParams.get('currentOnly') !== 'false';

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId query parameter is required' },
        { status: 400 }
      );
    }

    // Verify source exists
    const source = await getSource(sourceId);
    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    const summaries = await getSummariesBySource(
      sourceId,
      summaryType || undefined,
      currentOnly
    );

    return NextResponse.json({ summaries });
  } catch (error) {
    console.error('Error listing summaries:', error);
    return NextResponse.json(
      { error: 'Failed to list summaries' },
      { status: 500 }
    );
  }
}

// POST /api/summaries - Generate summaries for a source
export async function POST(request: NextRequest) {
  // Rate limit AI processing
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(
    `summarize:${clientIP}`,
    RateLimitConfigs.AI_PROCESSING
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many summarization requests. Please wait before trying again.' },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  }

  try {
    await initializeDb();

    // Safe JSON parsing with error handling
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { sourceId, forceRegenerate = false } = body;

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId is required' },
        { status: 400 }
      );
    }

    // Verify source exists and has content
    const source = await getSource(sourceId);
    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    if (!source.rawText) {
      return NextResponse.json(
        { error: 'Source has no text content to summarize' },
        { status: 400 }
      );
    }

    // Check for existing summaries
    const existingSummaries = await getSummariesBySource(sourceId);
    if (existingSummaries.length > 0 && !forceRegenerate) {
      return NextResponse.json({
        message: 'Summaries already exist. Use forceRegenerate=true to regenerate.',
        summaries: existingSummaries,
      });
    }

    // Delete existing segments if regenerating
    if (forceRegenerate) {
      await deleteDocumentSegments(sourceId);
    }

    // Generate hierarchical summaries
    const result = await generateHierarchicalSummaries({
      sourceId,
      sourceTitle: source.title,
      text: source.rawText,
    });

    // Store segments in database
    const segmentsToStore = result.segments.map((seg, i) => ({
      sourceId: seg.sourceId,
      segmentIndex: i,
      startIndex: seg.startIndex,
      endIndex: seg.endIndex,
      sectionTitle: seg.sectionTitle,
      level: seg.level,
      estimatedTokens: seg.estimatedTokens,
    }));

    await createDocumentSegments(segmentsToStore);

    // Store summaries in database
    const savedSummaries = await createSummaries(result.summaries);

    return NextResponse.json({
      success: true,
      segmentCount: result.segments.length,
      summaryCount: savedSummaries.length,
      summaries: savedSummaries,
    });
  } catch (error) {
    console.error('Error generating summaries:', error);
    return NextResponse.json(
      { error: 'Failed to generate summaries' },
      { status: 500 }
    );
  }
}
