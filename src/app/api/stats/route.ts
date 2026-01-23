// API route for user statistics
import { NextResponse } from 'next/server';
import { getStats, initializeDb } from '@/lib/db/client';

// GET /api/stats - Get user statistics
export async function GET() {
  try {
    await initializeDb();
    const stats = await getStats();
    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
