# LearnFlow - ADHD-Friendly Learning Bot

A personal web application that transforms learning content into ADHD-optimized micro-lessons and spaced repetition flashcards.

## Features

### Content Ingestion
- **PDF Upload** - Extract text from PDF documents
- **Text Input** - Paste any text content directly
- *YouTube & Audio (coming soon)*

### ADHD-Friendly Learning
- **Micro-Lessons** - Content broken into 2-5 minute chunks
- **Hooks & Takeaways** - Each lesson starts with engagement and ends with a clear summary
- **Visual Progress** - Track your learning with progress indicators
- **Difficulty Levels** - Content categorized by complexity

### Flashcard System
- **SM-2 Algorithm** - Scientifically-proven spaced repetition
- **Simple Rating** - Just 4 buttons: Again, Hard, Good, Easy
- **Hints & Mnemonics** - Memory aids for each card
- **Visual Cues** - Emoji associations for better recall

## Tech Stack

- **Frontend**: Next.js 14, React, TailwindCSS, shadcn/ui
- **Backend**: Next.js API Routes (ready for Cloudflare Workers migration)
- **Database**: SQLite (better-sqlite3 for development)
- **AI**: Claude API (Anthropic)
- **PDF Parsing**: pdf-parse

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Anthropic API key

### Installation

```bash
# Clone the repository
cd adhd-learning-bot

# Install dependencies
bun install

# Copy environment file
cp .env.example .env.local

# Add your Anthropic API key to .env.local
# ANTHROPIC_API_KEY=your-key-here

# Run the development server
bun dev
```

### Usage

1. **Upload Content** - Go to the Upload tab and upload a PDF or paste text
2. **Wait for Processing** - AI will chunk your content into micro-lessons
3. **Study** - Browse your library and click "Study" to start learning
4. **Review Flashcards** - Use the Review tab for spaced repetition practice

## Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── sources/       # Content source management
│   │   ├── lessons/       # Micro-lesson retrieval
│   │   ├── flashcards/    # Flashcard operations
│   │   ├── process/       # AI processing trigger
│   │   └── stats/         # User statistics
│   ├── study/[sourceId]/  # Study mode page
│   └── page.tsx           # Main app page
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── upload/            # Upload portal
│   ├── library/           # Library browser
│   ├── study/             # Lesson viewer
│   └── flashcards/        # Flashcard review
├── lib/
│   ├── ai/                # AI chunking service
│   ├── db/                # Database client and schema
│   └── services/          # PDF extraction, SM-2 algorithm
└── types/                 # TypeScript types
```

## Implementation Phases

### Phase 1: Core MVP (Complete)
- [x] Project setup
- [x] PDF upload and text extraction
- [x] AI chunking into micro-lessons
- [x] Lesson viewer UI
- [x] Basic flashcard generation
- [x] SM-2 spaced repetition

### Phase 2: Full Ingestion (Planned)
- [ ] YouTube link processing
- [ ] Audio file transcription (Whisper)
- [ ] Source library management improvements

### Phase 3: ADHD Features (Planned)
- [ ] Visual summary generation (mind maps)
- [ ] Progress tracking and streaks
- [ ] TTS audio generation (ElevenLabs)
- [ ] Focus mode UI

### Phase 4: Polish (Planned)
- [ ] Mobile-responsive design
- [ ] Keyboard shortcuts
- [ ] Anki deck export
- [ ] PWA support

## Database Schema

The app uses SQLite with the following tables:
- `sources` - Uploaded content sources
- `micro_lessons` - Generated micro-lessons
- `flashcards` - Spaced repetition cards
- `progress` - Learning progress tracking
- `flashcard_reviews` - Review history for analytics

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sources` | GET | List all sources |
| `/api/sources` | POST | Upload new source |
| `/api/sources/[id]` | GET | Get source details |
| `/api/sources/[id]` | DELETE | Delete source |
| `/api/process/[id]` | POST | Process source with AI |
| `/api/process/[id]` | GET | Get processing status |
| `/api/lessons` | GET | Get lessons for source |
| `/api/lessons/[id]` | GET | Get lesson with flashcards |
| `/api/lessons/[id]` | POST | Mark lesson complete |
| `/api/flashcards` | GET | Get flashcards (due/all) |
| `/api/flashcards/[id]/review` | POST | Submit flashcard review |
| `/api/stats` | GET | Get user statistics |

## License

MIT
