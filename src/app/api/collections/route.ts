// API routes for summary collections
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getCollections,
  createCollection,
  getSource,
  addSourceToCollection,
  getCollectionSources,
  getSummariesBySource,
  createSummary,
} from '@/lib/db/client';
import { aggregateSummaries } from '@/lib/ai/aggregator';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  RateLimitConfigs,
} from '@/lib/rate-limiter';
import { CollectionType, Summary } from '@/types/summaries';

// GET /api/collections - List all collections
export async function GET(request: NextRequest) {
  try {
    await initializeDb();

    const collections = await getCollections();

    return NextResponse.json({ collections });
  } catch (error) {
    console.error('Error listing collections:', error);
    return NextResponse.json(
      { error: 'Failed to list collections' },
      { status: 500 }
    );
  }
}

// POST /api/collections - Create a new collection
export async function POST(request: NextRequest) {
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
    const { name, description, collectionType = 'custom', sourceIds = [] } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'name is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate collection type
    const validTypes: CollectionType[] = ['topic', 'course', 'custom'];
    if (!validTypes.includes(collectionType)) {
      return NextResponse.json(
        { error: `collectionType must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create the collection
    const collection = await createCollection({
      name,
      description,
      collectionType,
    });

    // Add initial sources if provided
    if (sourceIds.length > 0) {
      for (let i = 0; i < sourceIds.length; i++) {
        const sourceId = sourceIds[i];

        // Verify source exists
        const source = await getSource(sourceId);
        if (!source) {
          console.warn(`Source ${sourceId} not found, skipping`);
          continue;
        }

        await addSourceToCollection({
          collectionId: collection.id,
          sourceId,
          sequence: i + 1,
          weight: 1.0,
        });
      }
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error('Error creating collection:', error);
    return NextResponse.json(
      { error: 'Failed to create collection' },
      { status: 500 }
    );
  }
}
