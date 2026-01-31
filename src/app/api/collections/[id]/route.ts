// API routes for individual collection operations
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getCollection,
  getCollectionSources,
  getSource,
  addSourceToCollection,
} from '@/lib/db/client';

// GET /api/collections/[id] - Get collection details with sources
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;

    const collection = await getCollection(id);
    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Get sources in this collection
    const collectionSources = await getCollectionSources(id);

    // Get full source details, filtering out deleted sources
    const sourcesWithDetails = await Promise.all(
      collectionSources.map(async (cs) => {
        const source = await getSource(cs.sourceId);
        // Handle case where source may have been deleted
        if (!source) {
          console.warn(`Source ${cs.sourceId} not found (may have been deleted)`);
          return null;
        }
        return {
          ...cs,
          source,
        };
      })
    );
    // Filter out null entries where source was not found
    const sources = sourcesWithDetails.filter((s): s is NonNullable<typeof s> => s !== null);

    return NextResponse.json({
      collection,
      sources,
    });
  } catch (error) {
    console.error('Error getting collection:', error);
    return NextResponse.json(
      { error: 'Failed to get collection' },
      { status: 500 }
    );
  }
}

// POST /api/collections/[id] - Add a source to a collection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Safe JSON parsing with error handling
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    const { sourceId, sequence, weight = 1.0 } = body;

    if (!sourceId || typeof sourceId !== 'string') {
      return NextResponse.json(
        { error: 'sourceId is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate weight if provided
    if (weight !== undefined && (typeof weight !== 'number' || weight < 0)) {
      return NextResponse.json(
        { error: 'weight must be a non-negative number' },
        { status: 400 }
      );
    }

    // Validate sequence if provided
    if (sequence !== undefined && (!Number.isInteger(sequence) || sequence < 0)) {
      return NextResponse.json(
        { error: 'sequence must be a non-negative integer' },
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

    // Add to collection
    const collectionSource = await addSourceToCollection({
      collectionId,
      sourceId,
      sequence,
      weight,
    });

    return NextResponse.json({ collectionSource });
  } catch (error) {
    console.error('Error adding source to collection:', error);
    return NextResponse.json(
      { error: 'Failed to add source to collection' },
      { status: 500 }
    );
  }
}
