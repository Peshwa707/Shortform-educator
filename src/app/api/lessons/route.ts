// API routes for lessons
import { NextRequest, NextResponse } from 'next/server';
import { getMicroLessons, initializeDb } from '@/lib/db/client';

// GET /api/lessons?sourceId=xxx - Get lessons for a source
export async function GET(request: NextRequest) {
  try {
    await initializeDb();
    const { searchParams } = new URL(request.url);
    const sourceId = searchParams.get('sourceId');

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId query parameter is required' },
        { status: 400 }
      );
    }

    const lessons = await getMicroLessons(sourceId);
    return NextResponse.json({ lessons });
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lessons' },
      { status: 500 }
    );
  }
}
