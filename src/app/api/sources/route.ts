// API routes for managing sources
import { NextRequest, NextResponse } from 'next/server';
import { createSource, getAllSources, initializeDb } from '@/lib/db/client';
import { extractPdfText, cleanExtractedText, extractTitle } from '@/lib/services/pdf-extractor';

// GET /api/sources - List all sources
export async function GET() {
  try {
    await initializeDb();
    const sources = await getAllSources();
    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Error fetching sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sources' },
      { status: 500 }
    );
  }
}

// POST /api/sources - Create a new source (upload PDF or submit text)
export async function POST(request: NextRequest) {
  try {
    await initializeDb();
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const title = formData.get('title') as string | null;

      if (!file) {
        return NextResponse.json(
          { error: 'No file provided' },
          { status: 400 }
        );
      }

      // Check file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json(
          { error: 'Only PDF files are supported currently' },
          { status: 400 }
        );
      }

      // Read file buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Extract text from PDF
      const extracted = await extractPdfText(buffer);
      const cleanedText = cleanExtractedText(extracted.text);
      const detectedTitle = extractTitle(cleanedText, extracted.metadata);

      // Create source record
      const source = await createSource({
        type: 'pdf',
        title: title || detectedTitle,
        rawText: cleanedText,
      });

      return NextResponse.json({
        source,
        pageCount: extracted.pageCount,
        wordCount: cleanedText.split(/\s+/).length,
      });
    } else {
      // Handle JSON body (text input)
      const body = await request.json();
      const { type, title, text, url } = body;

      if (type === 'text') {
        if (!text || !title) {
          return NextResponse.json(
            { error: 'Text and title are required' },
            { status: 400 }
          );
        }

        const source = await createSource({
          type: 'text',
          title,
          rawText: text,
        });

        return NextResponse.json({ source });
      } else if (type === 'youtube') {
        // YouTube processing will be added in Phase 2
        return NextResponse.json(
          { error: 'YouTube processing not yet implemented' },
          { status: 501 }
        );
      } else if (type === 'audio') {
        // Audio processing will be added in Phase 2
        return NextResponse.json(
          { error: 'Audio processing not yet implemented' },
          { status: 501 }
        );
      }

      return NextResponse.json(
        { error: 'Invalid source type' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error creating source:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create source', details: errorMessage },
      { status: 500 }
    );
  }
}
