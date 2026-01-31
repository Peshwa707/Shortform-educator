// Types for the Summarization System
// Multi-level summaries, versioning, and cross-source aggregation

// ============================================================================
// Summary Types
// ============================================================================

export type SummaryType = 'executive' | 'key_points' | 'detailed' | 'segment';

export interface Summary {
  id: string;
  sourceId: string;
  summaryType: SummaryType;
  title: string;
  content: string;
  wordCount: number;

  // Versioning
  version: number;
  isCurrent: boolean;
  parentVersionId?: string;

  // Generation metadata
  generationModel: string;
  generationDurationMs?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;

  // Quality metrics
  qualityScore?: number;
  userRating?: 1 | 2 | 3 | 4 | 5;

  createdAt: Date;
  updatedAt: Date;
}

export type CreateSummaryInput = Omit<Summary, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'isCurrent'>;

export type UpdateSummaryInput = Partial<Pick<Summary, 'title' | 'content' | 'qualityScore' | 'userRating'>>;

// ============================================================================
// Document Segment Types
// ============================================================================

export interface DocumentSegment {
  id: string;
  sourceId: string;
  segmentIndex: number;
  startIndex?: number;
  endIndex?: number;
  sectionTitle?: string;
  level: number;
  estimatedTokens?: number;
  text?: string; // Not stored in DB, used during processing
  createdAt: Date;
}

export type CreateDocumentSegmentInput = Omit<DocumentSegment, 'id' | 'createdAt'>;

// ============================================================================
// Collection Types
// ============================================================================

export type CollectionType = 'topic' | 'course' | 'custom';

export interface SummaryCollection {
  id: string;
  name: string;
  description?: string;
  collectionType: CollectionType;
  aggregatedSummaryId?: string;
  createdAt: Date;
  // Computed fields
  sourceCount?: number;
}

export type CreateCollectionInput = Omit<SummaryCollection, 'id' | 'createdAt' | 'sourceCount'>;

export interface CollectionSource {
  id: string;
  collectionId: string;
  sourceId: string;
  sequence?: number;
  weight: number;
}

export type CreateCollectionSourceInput = Omit<CollectionSource, 'id'>;

// ============================================================================
// Concept Types
// ============================================================================

export interface SummaryConcept {
  id: string;
  summaryId: string;
  concept: string;
  conceptNormalized: string;
  definition?: string;
  importanceScore: number;
}

export type CreateConceptInput = Omit<SummaryConcept, 'id'>;

// ============================================================================
// Export Types
// ============================================================================

export type ExportFormat = 'markdown' | 'pdf' | 'anki';

export interface SummaryExport {
  id: string;
  summaryId: string;
  exportFormat: ExportFormat;
  filePath?: string;
  downloadCount: number;
  createdAt: Date;
}

export type CreateExportInput = Omit<SummaryExport, 'id' | 'createdAt' | 'downloadCount'>;

// ============================================================================
// Processing Types
// ============================================================================

export interface SummarizationConfig {
  maxSegmentTokens: number;
  segmentSummaryTokens: number;
  keyPointsOutputTokens: number;
  executiveOutputTokens: number;
}

export const DEFAULT_SUMMARIZATION_CONFIG: SummarizationConfig = {
  maxSegmentTokens: 15000,
  segmentSummaryTokens: 2000,
  keyPointsOutputTokens: 1500,
  executiveOutputTokens: 800,
};

export interface SummarizationProgress {
  sourceId: string;
  status: 'pending' | 'segmenting' | 'summarizing_segments' | 'synthesizing' | 'complete' | 'error';
  progress: number;
  currentSegment?: number;
  totalSegments?: number;
  error?: string;
}

export interface HierarchicalSummaryResult {
  executive?: Summary;
  keyPoints?: Summary;
  detailed?: Summary;
  segments: Summary[];
}

// ============================================================================
// Aggregation Types
// ============================================================================

export interface AggregationOptions {
  deduplicateConcepts: boolean;
  weightByRecency: boolean;
  maxKeyPoints: number;
  includeSourceAttribution: boolean;
}

export const DEFAULT_AGGREGATION_OPTIONS: AggregationOptions = {
  deduplicateConcepts: true,
  weightByRecency: false,
  maxKeyPoints: 15,
  includeSourceAttribution: true,
};

export interface AggregatedSummary {
  summary: Summary;
  commonThemes: string[];
  uniqueInsights: { sourceId: string; insight: string; significance: string }[];
  sourceSummaries: Summary[];
}

// ============================================================================
// API Types
// ============================================================================

export interface GenerateSummaryRequest {
  sourceId: string;
  summaryType?: SummaryType;
  forceRegenerate?: boolean;
}

export interface GetSummariesQuery {
  sourceId?: string;
  summaryType?: SummaryType;
  isCurrent?: boolean;
  limit?: number;
  offset?: number;
}

export interface ExportSummaryRequest {
  format: ExportFormat;
  includeMetadata?: boolean;
}
