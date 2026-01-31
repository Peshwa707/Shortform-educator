// API routes for individual summary operations
import { NextRequest, NextResponse } from 'next/server';
import {
  initializeDb,
  getSummary,
  updateSummary,
  deleteSummary,
} from '@/lib/db/client';
import { UpdateSummaryInput } from '@/types/summaries';

// GET /api/summaries/[id] - Get a specific summary
export async function GET(
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

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Error getting summary:', error);
    return NextResponse.json(
      { error: 'Failed to get summary' },
      { status: 500 }
    );
  }
}

// PATCH /api/summaries/[id] - Update a summary (title, content, rating)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;

    // Verify summary exists
    const existing = await getSummary(id);
    if (!existing) {
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
    const updates: UpdateSummaryInput = {};

    // Only allow specific fields to be updated with type validation
    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        return NextResponse.json(
          { error: 'title must be a string' },
          { status: 400 }
        );
      }
      updates.title = body.title;
    }
    if (body.content !== undefined) {
      if (typeof body.content !== 'string') {
        return NextResponse.json(
          { error: 'content must be a string' },
          { status: 400 }
        );
      }
      updates.content = body.content;
    }
    if (body.qualityScore !== undefined) {
      if (typeof body.qualityScore !== 'number' || body.qualityScore < 0 || body.qualityScore > 1) {
        return NextResponse.json(
          { error: 'qualityScore must be a number between 0 and 1' },
          { status: 400 }
        );
      }
      updates.qualityScore = body.qualityScore;
    }
    if (body.userRating !== undefined) {
      if (!Number.isInteger(body.userRating) || body.userRating < 1 || body.userRating > 5) {
        return NextResponse.json(
          { error: 'userRating must be an integer between 1 and 5' },
          { status: 400 }
        );
      }
      updates.userRating = body.userRating;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid update fields provided' },
        { status: 400 }
      );
    }

    await updateSummary(id, updates);

    const updated = await getSummary(id);
    return NextResponse.json({ summary: updated });
  } catch (error) {
    console.error('Error updating summary:', error);
    return NextResponse.json(
      { error: 'Failed to update summary' },
      { status: 500 }
    );
  }
}

// DELETE /api/summaries/[id] - Delete a summary
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await initializeDb();
    const { id } = await params;

    // Verify summary exists
    const existing = await getSummary(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Summary not found' },
        { status: 404 }
      );
    }

    await deleteSummary(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting summary:', error);
    return NextResponse.json(
      { error: 'Failed to delete summary' },
      { status: 500 }
    );
  }
}
