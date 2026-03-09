/**
 * FamilyPulse Domain Types
 * Comprehensive TypeScript interfaces for all domain objects.
 */

// ============================================================
// CORE ENTITIES
// ============================================================

export interface Family {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface FamilyMember {
  id: string
  family_id: string
  member_name: string
  relationship: string | null  // 'parent', 'child', 'spouse', 'grandparent', etc.
  date_of_birth: string | null // ISO date string
  external_id: string | null   // maps to Excel member_id column
  created_at: string
  updated_at: string
  profile?: MemberProfile      // joined relation
}

export interface MemberProfile {
  id: string
  member_id: string
  avatar_color: string
  notes: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// METRICS
// ============================================================

export type MetricCategory = 'activity' | 'sleep' | 'heart' | 'stress' | 'nutrition' | 'recovery'

export interface MetricType {
  id: string
  key: string           // e.g. 'steps', 'hrv', 'sleep_hours'
  label: string         // e.g. 'Steps', 'HRV', 'Sleep Duration'
  unit: string | null   // e.g. 'steps', 'ms', 'hours'
  category: MetricCategory | null
  description: string | null
  normal_range_min: number | null
  normal_range_max: number | null
  higher_is_better: boolean
  created_at: string
}

export interface MetricObservation {
  id: string
  member_id: string
  metric_type_id: string
  observed_date: string    // ISO date string
  value: number | null
  raw_value: string | null // original string from Excel
  source: string
  created_at: string
  metric_type?: MetricType // joined relation
}

// ============================================================
// DAILY SUMMARIES
// ============================================================

export type FlagSeverity = 'critical' | 'warning' | 'info'

export interface SummaryFlag {
  metric: string
  severity: FlagSeverity
  message: string
  value?: number
  normal_range_min?: number
  normal_range_max?: number
}

export interface DailySummary {
  id: string
  member_id: string
  summary_date: string     // ISO date string
  readiness_score: number | null
  stress_score: number | null
  activity_score: number | null
  sleep_score: number | null
  overall_score: number | null
  flags: SummaryFlag[]
  created_at: string
}

// ============================================================
// RECOMMENDATIONS
// ============================================================

export type ActionType = 'activity' | 'sleep' | 'nutrition' | 'stress' | 'social'
export type Priority = 1 | 2 | 3   // 1=high, 2=medium, 3=low
export type EvidenceLevel = 'strong' | 'moderate' | 'general' | 'wellness'

export interface Recommendation {
  id: string
  family_id: string
  title: string
  explanation: string
  action_type: ActionType | null
  priority: Priority
  affected_member_ids: string[]
  evidence_level: EvidenceLevel
  is_active: boolean
  generated_at: string
  expires_at: string | null
  created_at: string
  citations?: SourceCitation[]   // joined relation
}

export type FeedbackType = 'helpful' | 'not_helpful' | 'already_doing' | 'not_applicable'

export interface RecommendationFeedback {
  id: string
  recommendation_id: string
  feedback_type: FeedbackType
  comment: string | null
  created_at: string
}

// ============================================================
// SOURCES & CITATIONS
// ============================================================

export interface SourceDocument {
  id: string
  title: string
  source_org: string      // 'CDC', 'NIH', 'MedlinePlus', 'NHS', etc.
  url: string | null
  content_summary: string | null
  topic_tags: string[]
  is_approved: boolean
  created_at: string
}

export interface SourceCitation {
  id: string
  source_document_id: string
  recommendation_id: string | null
  chat_message_id: string | null
  excerpt: string | null
  relevance_score: number | null
  created_at: string
  source_document?: SourceDocument  // joined relation
}

export interface Citation {
  title: string
  source_org: string
  url: string | null
  excerpt: string | null
}

// ============================================================
// CHAT
// ============================================================

export type ChatRole = 'user' | 'assistant'

export interface ChatSession {
  id: string
  family_id: string
  title: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  role: ChatRole
  content: string
  citations: Citation[]
  created_at: string
}

// ============================================================
// INGESTION
// ============================================================

export type IngestionStatus = 'pending' | 'running' | 'success' | 'error'

export interface IngestionError {
  row: number
  column?: string
  message: string
  raw_value?: string
}

export interface IngestionLog {
  id: string
  file_name: string | null
  rows_processed: number | null
  rows_inserted: number | null
  rows_updated: number | null
  errors: IngestionError[]
  status: IngestionStatus
  started_at: string
  completed_at: string | null
}

/** Maps Excel column header strings to internal field names */
export type ColumnMapping = Record<string, string>

export interface ColumnMappingConfig {
  mapping: ColumnMapping
  dateFormat?: string        // e.g. 'MM/dd/yyyy', defaults to auto-detect
  sheetName?: string | number  // defaults to first sheet
  headerRow?: number         // defaults to 1
  skipRows?: number[]        // row indices to skip (0-indexed)
}

export interface IngestionConfig {
  filePath: string
  columnMapping: ColumnMappingConfig
  familyId?: string          // if provided, all members linked to this family
  dryRun?: boolean           // if true, validate only without DB writes
}

export interface RawRow {
  rowIndex: number
  data: Record<string, unknown>
}

export interface NormalizedRow {
  rowIndex: number
  family_id: string | null
  member_id: string          // external_id
  member_name: string
  relationship: string | null
  date: string               // ISO date string
  steps: number | null
  sleep_hours: number | null
  resting_heart_rate: number | null
  hrv: number | null
  stress_score: number | null
  readiness_score: number | null
  calories_burned: number | null
  activity_minutes: number | null
  blood_oxygen: number | null
  glucose: number | null
  notes: string | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface IngestionResult {
  logId: string
  rowsProcessed: number
  rowsInserted: number
  rowsUpdated: number
  errors: IngestionError[]
  status: IngestionStatus
}

// ============================================================
// DETECTION ENGINE
// ============================================================

export interface DetectionFlag {
  member_id: string
  member_name: string
  metric_key: string
  metric_label: string
  severity: FlagSeverity
  message: string
  current_value: number | null
  normal_range_min: number | null
  normal_range_max: number | null
  trend?: 'improving' | 'declining' | 'stable' | 'unknown'
  trend_data?: number[]    // last N values for sparkline
}

export type FamilyPatternType =
  | 'multiple_high_stress'
  | 'multiple_low_readiness'
  | 'multiple_poor_sleep'
  | 'multiple_low_activity'
  | 'high_low_activity_contrast'
  | 'synchronized_decline'
  | 'one_member_critical'

export interface FamilyPattern {
  type: FamilyPatternType
  affected_member_ids: string[]
  severity: FlagSeverity
  description: string
  metadata?: Record<string, unknown>
}

export interface DetectionResult {
  flags: DetectionFlag[]
  patterns: FamilyPattern[]
  computed_at: string
  member_summaries: Record<string, MemberDetectionSummary>
}

export interface MemberDetectionSummary {
  member_id: string
  member_name: string
  total_flags: number
  critical_flags: number
  warning_flags: number
  overall_status: 'critical' | 'needs_attention' | 'good' | 'excellent'
}

export interface SummaryScores {
  readiness_score: number | null
  stress_score: number | null
  activity_score: number | null
  sleep_score: number | null
  overall_score: number | null
}

// ============================================================
// RECOMMENDATION ENGINE
// ============================================================

export interface RecommendationCandidate {
  id: string                  // deterministic slug e.g. 'stress_family_walk'
  title: string
  action_type: ActionType
  priority: Priority
  affected_member_ids: string[]
  trigger_patterns: FamilyPatternType[]
  trigger_flags: string[]     // metric keys
  suggested_explanation: string  // base text to be enhanced by LLM
  relevant_topics: string[]   // for source retrieval
  evidence_level: EvidenceLevel
}

// ============================================================
// DASHBOARD AGGREGATE
// ============================================================

export interface MemberWithData {
  member: FamilyMember
  latest_summary: DailySummary | null
  recent_observations: MetricObservation[]
  flags: DetectionFlag[]
}

export interface DashboardData {
  family: Family
  members: MemberWithData[]
  active_recommendations: Recommendation[]
  metric_types: MetricType[]
  detection_result: DetectionResult | null
  last_ingested_at: string | null
  generated_at: string
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

export interface MetricsFilterParams {
  member_id?: string
  date_from?: string
  date_to?: string
  metric_keys?: string[]
}
