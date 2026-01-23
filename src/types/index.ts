// Core types for ADHD-Friendly Learning Bot

export type SourceType = 'pdf' | 'youtube' | 'audio' | 'text';

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  originalUrl?: string;
  filePath?: string;
  rawText?: string;
  processedAt?: Date;
  createdAt: Date;
  // Computed fields
  lessonCount?: number;
  cardCount?: number;
  progress?: number;
}

export interface MicroLesson {
  id: string;
  sourceId: string;
  sequence: number;
  title: string;
  hook: string;
  content: string;
  keyTakeaway: string;
  estimatedMinutes: number;
  difficulty: 1 | 2 | 3;
  audioPath?: string;
  createdAt: Date;
  // Computed
  isCompleted?: boolean;
}

export interface Flashcard {
  id: string;
  lessonId: string;
  front: string;
  back: string;
  hint?: string;
  mnemonic?: string;
  visualCue?: string;
  // SM-2 algorithm fields
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview?: Date;
  createdAt: Date;
}

export interface Progress {
  id: string;
  lessonId: string;
  completedAt: Date;
  timeSpentSeconds: number;
  comprehensionRating: 1 | 2 | 3 | 4 | 5;
}

export interface VisualSummary {
  id: string;
  sourceId: string;
  type: 'mindmap' | 'hierarchy' | 'connections';
  data: MindMapData | HierarchyData | ConnectionsData;
  createdAt: Date;
}

// Visual summary data structures
export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}

export interface MindMapData {
  root: MindMapNode;
}

export interface HierarchyItem {
  id: string;
  label: string;
  level: number;
  children?: HierarchyItem[];
}

export interface HierarchyData {
  items: HierarchyItem[];
}

export interface Connection {
  from: string;
  to: string;
  label?: string;
}

export interface ConnectionsData {
  nodes: { id: string; label: string }[];
  connections: Connection[];
}

// SM-2 Algorithm types
export type FlashcardRating = 0 | 1 | 2 | 3 | 4 | 5;

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReview: Date;
}

// API request/response types
export interface ProcessingStatus {
  sourceId: string;
  status: 'pending' | 'extracting' | 'chunking' | 'generating_cards' | 'generating_audio' | 'complete' | 'error';
  progress: number;
  message?: string;
  error?: string;
}

export interface UploadResponse {
  sourceId: string;
  message: string;
}

export interface StudySession {
  sourceId: string;
  currentLessonIndex: number;
  startedAt: Date;
  lessons: MicroLesson[];
  completedLessonIds: string[];
}

// Stats
export interface UserStats {
  totalSources: number;
  totalLessons: number;
  completedLessons: number;
  totalCards: number;
  cardsReviewedToday: number;
  currentStreak: number;
  longestStreak: number;
}
