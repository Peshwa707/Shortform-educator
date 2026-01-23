// API routes for individual source operations
import { NextRequest, NextResponse } from 'next/server';
import { getSource, deleteSource, initializeDb } from '@/lib/db/client';

// GET /api/sources/[id] - Get a single source
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;
    const source = await getSource(id);

    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ source });
  } catch (error) {
    console.error('Error fetching source:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source' },
      { status: 500 }
    );
  }
}

// DELETE /api/sources/[id] - Delete a source and all related content
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;
    const source = await getSource(id);

    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    await deleteSource(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting source:', error);
    return NextResponse.json(
      { error: 'Failed to delete source' },
      { status: 500 }
    );
  }
}
