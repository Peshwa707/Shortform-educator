// API route for getting summaries by source
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getSource,
  getSummariesBySource,
} from '@/lib/db/client';
import { SummaryType } from '@/types/summaries';

// GET /api/sources/[id]/summaries - Get all summaries for a source
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id: sourceId } = await params;
    const { searchParams } = new URL(request.url);

    const summaryType = searchParams.get('type') as SummaryType | null;
    const includeVersions = searchParams.get('includeVersions') === 'true';

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
      !includeVersions
    );

    // Group by type for convenience
    const grouped = {
      executive: summaries.filter(s => s.summaryType === 'executive'),
      keyPoints: summaries.filter(s => s.summaryType === 'key_points'),
      detailed: summaries.filter(s => s.summaryType === 'detailed'),
      segments: summaries.filter(s => s.summaryType === 'segment'),
    };

    return NextResponse.json({
      sourceId,
      summaries,
      grouped,
      counts: {
        total: summaries.length,
        executive: grouped.executive.length,
        keyPoints: grouped.keyPoints.length,
        detailed: grouped.detailed.length,
        segments: grouped.segments.length,
      },
    });
  } catch (error) {
    console.error('Error getting source summaries:', error);
    return NextResponse.json(
      { error: 'Failed to get summaries' },
      { status: 500 }
    );
  }
}
