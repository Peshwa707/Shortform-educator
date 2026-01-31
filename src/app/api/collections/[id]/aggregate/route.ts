// API route for aggregating collection summaries
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getCollection,
  getCollectionSources,
  getSummariesBySource,
  createSummary,
} from '@/lib/db/client';
import { aggregateSummaries, generateAggregatedSummary } from '@/lib/ai/aggregator';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  RateLimitConfigs,
} from '@/lib/rate-limiter';
import { Summary } from '@/types/summaries';

// POST /api/collections/[id]/aggregate - Generate aggregated summary
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit AI processing
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(
    `aggregate:${clientIP}`,
    RateLimitConfigs.AI_PROCESSING
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many aggregation requests. Please wait before trying again.' },
      {
        status: 429,
        headers: createRateLimitHeaders(rateLimitResult),
      }
    );
  }

  try {
    await initializeDb();
    const { id: collectionId } = await params;

    const collection = await getCollection(collectionId);
    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Get sources in collection
    const collectionSources = await getCollectionSources(collectionId);
    if (collectionSources.length < 2) {
      return NextResponse.json(
        { error: 'Collection needs at least 2 sources for aggregation' },
        { status: 400 }
      );
    }

    // Get key_points summaries for each source
    const summariesToAggregate: Summary[] = [];

    for (const cs of collectionSources) {
      const summaries = await getSummariesBySource(cs.sourceId, 'key_points', true);
      if (summaries.length > 0) {
        summariesToAggregate.push(summaries[0]);
      }
    }

    if (summariesToAggregate.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 sources must have key_points summaries' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { includeThemes = true, includeInsights = true } = body;

    // Generate aggregated summary
    let result;

    if (includeThemes || includeInsights) {
      result = await generateAggregatedSummary({
        summaries: summariesToAggregate,
        collectionName: collection.name,
        collectionId,
      });
    } else {
      const aggregatedInput = await aggregateSummaries({
        summaries: summariesToAggregate,
        collectionName: collection.name,
        collectionId,
      });

      result = {
        summary: {
          ...aggregatedInput,
          id: '',
          version: 1,
          isCurrent: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        commonThemes: [],
        uniqueInsights: [],
        sourceSummaries: summariesToAggregate,
      };
    }

    // Save the aggregated summary
    const savedSummary = await createSummary(result.summary);

    return NextResponse.json({
      success: true,
      summary: savedSummary,
      commonThemes: result.commonThemes,
      uniqueInsights: result.uniqueInsights,
      sourceCount: summariesToAggregate.length,
    });
  } catch (error) {
    console.error('Error aggregating summaries:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate summaries' },
      { status: 500 }
    );
  }
}
