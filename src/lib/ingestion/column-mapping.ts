/**
 * Column Mapping Configuration for Excel Ingestion
 *
 * Maps Excel column header strings to internal NormalizedRow field names.
 * Supports flexible header variations (case-insensitive, with/without underscores/spaces).
 */

import type { ColumnMapping, ColumnMappingConfig } from '@/types'

// ============================================================
// DEFAULT COLUMN MAP
// Maps common Excel header variations -> internal field names
// ============================================================

/**
 * Default column mapping that handles common Excel header variations.
 * Keys are normalized (lowercase, underscores) Excel headers.
 * Values are internal NormalizedRow field names.
 */
export const DEFAULT_COLUMN_MAP: ColumnMapping = {
  // Identity fields
  family_id: 'family_id',
  familyid: 'family_id',
  family: 'family_id',

  member_id: 'member_id',
  memberid: 'member_id',
  member: 'member_id',
  id: 'member_id',
  participant_id: 'member_id',
  user_id: 'member_id',

  member_name: 'member_name',
  membername: 'member_name',
  name: 'member_name',
  full_name: 'member_name',
  fullname: 'member_name',
  person: 'member_name',

  relationship: 'relationship',
  relation: 'relationship',
  role: 'relationship',

  // Date field
  date: 'date',
  observation_date: 'date',
  record_date: 'date',
  day: 'date',
  timestamp: 'date',

  // Activity metrics
  steps: 'steps',
  step_count: 'steps',
  daily_steps: 'steps',

  sleep_hours: 'sleep_hours',
  sleep: 'sleep_hours',
  sleep_duration: 'sleep_hours',
  hours_of_sleep: 'sleep_hours',
  total_sleep: 'sleep_hours',

  resting_heart_rate: 'resting_heart_rate',
  rhr: 'resting_heart_rate',
  heart_rate: 'resting_heart_rate',
  heartrate: 'resting_heart_rate',
  resting_hr: 'resting_heart_rate',

  hrv: 'hrv',
  heart_rate_variability: 'hrv',
  hrv_ms: 'hrv',

  stress_score: 'stress_score',
  stress: 'stress_score',
  stress_level: 'stress_score',

  readiness_score: 'readiness_score',
  readiness: 'readiness_score',
  recovery_score: 'readiness_score',
  recovery: 'readiness_score',

  calories_burned: 'calories_burned',
  calories: 'calories_burned',
  active_calories: 'calories_burned',
  kcal: 'calories_burned',

  activity_minutes: 'activity_minutes',
  active_minutes: 'activity_minutes',
  exercise_minutes: 'activity_minutes',
  workout_minutes: 'activity_minutes',

  blood_oxygen: 'blood_oxygen',
  spo2: 'blood_oxygen',
  oxygen_saturation: 'blood_oxygen',
  blood_o2: 'blood_oxygen',

  glucose: 'glucose',
  blood_glucose: 'glucose',
  blood_sugar: 'glucose',
  glucose_mg_dl: 'glucose',

  // Notes
  notes: 'notes',
  note: 'notes',
  comments: 'notes',
  comment: 'notes',
}

/**
 * Default ingestion configuration using the default column map.
 */
export const DEFAULT_INGESTION_CONFIG: ColumnMappingConfig = {
  mapping: DEFAULT_COLUMN_MAP,
  dateFormat: undefined,     // auto-detect
  sheetName: 0,              // first sheet
  headerRow: 1,
  skipRows: [],
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Normalizes a column header string for matching.
 * Converts to lowercase, replaces spaces/hyphens/dots with underscores,
 * strips leading/trailing whitespace.
 *
 * @param name - Raw column header string from Excel
 * @returns Normalized string suitable for lookup in column maps
 *
 * @example
 * normalizeColumnName('Heart Rate Variability') // => 'heart_rate_variability'
 * normalizeColumnName('  Steps  ')              // => 'steps'
 * normalizeColumnName('HRV-MS')                 // => 'hrv_ms'
 */
export function normalizeColumnName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s\-\.]+/g, '_')   // spaces, hyphens, dots -> underscore
    .replace(/[^a-z0-9_]/g, '')   // remove any remaining non-alphanumeric
    .replace(/__+/g, '_')         // collapse multiple underscores
    .replace(/^_|_$/g, '')        // trim leading/trailing underscores
}

/**
 * Resolves an Excel column header to an internal field name.
 * Uses the provided column mapping with normalized key lookup.
 *
 * @param rawHeader - Raw column header from Excel
 * @param mapping - ColumnMapping to resolve against
 * @returns Internal field name, or null if not mapped
 */
export function resolveColumnHeader(
  rawHeader: string,
  mapping: ColumnMapping
): string | null {
  const normalized = normalizeColumnName(rawHeader)

  // Exact match first
  if (mapping[normalized]) {
    return mapping[normalized]
  }

  // Partial match fallback: check if normalized header contains a known key
  for (const [key, value] of Object.entries(mapping)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value
    }
  }

  return null
}

// ============================================================
// VALIDATION
// ============================================================

/** Required internal fields that must appear in the column mapping */
const REQUIRED_FIELDS = ['member_id', 'member_name', 'date'] as const

/** All valid internal field names */
const VALID_INTERNAL_FIELDS = new Set([
  'family_id',
  'member_id',
  'member_name',
  'relationship',
  'date',
  'steps',
  'sleep_hours',
  'resting_heart_rate',
  'hrv',
  'stress_score',
  'readiness_score',
  'calories_burned',
  'activity_minutes',
  'blood_oxygen',
  'glucose',
  'notes',
])

export interface ColumnMappingValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  mappedFields: string[]
  unmappedHeaders: string[]
}

/**
 * Validates a ColumnMappingConfig for correctness and completeness.
 *
 * @param config - The ColumnMappingConfig to validate
 * @param actualHeaders - Optional list of actual Excel column headers to check coverage
 * @returns Validation result with errors, warnings, and coverage details
 */
export function validateColumnMapping(
  config: ColumnMappingConfig,
  actualHeaders?: string[]
): ColumnMappingValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const mappedFields = new Set<string>()
  const unmappedHeaders: string[] = []

  // Check all mapping values are valid internal fields
  for (const [excelHeader, internalField] of Object.entries(config.mapping)) {
    if (!VALID_INTERNAL_FIELDS.has(internalField)) {
      errors.push(
        `Invalid internal field name "${internalField}" for Excel column "${excelHeader}". ` +
        `Valid fields: ${[...VALID_INTERNAL_FIELDS].join(', ')}`
      )
    } else {
      mappedFields.add(internalField)
    }
  }

  // Check required fields are present in mapping values
  for (const requiredField of REQUIRED_FIELDS) {
    if (!mappedFields.has(requiredField)) {
      errors.push(
        `Required field "${requiredField}" is not mapped to any Excel column. ` +
        `Add an entry to the column mapping with value "${requiredField}".`
      )
    }
  }

  // Check for duplicate mappings (multiple Excel headers -> same internal field)
  const fieldCounts: Record<string, string[]> = {}
  for (const [excelHeader, internalField] of Object.entries(config.mapping)) {
    if (!fieldCounts[internalField]) {
      fieldCounts[internalField] = []
    }
    fieldCounts[internalField].push(excelHeader)
  }
  for (const [field, headers] of Object.entries(fieldCounts)) {
    if (headers.length > 1) {
      warnings.push(
        `Internal field "${field}" is mapped from multiple Excel columns: ${headers.join(', ')}. ` +
        `Only the last match will be used.`
      )
    }
  }

  // Check actual headers coverage if provided
  if (actualHeaders) {
    for (const header of actualHeaders) {
      const normalized = normalizeColumnName(header)
      if (!config.mapping[normalized]) {
        unmappedHeaders.push(header)
      }
    }
    if (unmappedHeaders.length > 0) {
      warnings.push(
        `${unmappedHeaders.length} Excel column(s) not mapped and will be ignored: ` +
        unmappedHeaders.join(', ')
      )
    }
  }

  // Warn if no metric fields are mapped
  const metricFields = [
    'steps', 'sleep_hours', 'resting_heart_rate', 'hrv',
    'stress_score', 'readiness_score', 'calories_burned',
    'activity_minutes', 'blood_oxygen', 'glucose',
  ]
  const hasSomeMetrics = metricFields.some(f => mappedFields.has(f))
  if (!hasSomeMetrics) {
    warnings.push(
      'No health metric fields are mapped. At least one metric field is recommended ' +
      '(steps, sleep_hours, hrv, etc.).'
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    mappedFields: [...mappedFields],
    unmappedHeaders,
  }
}

/**
 * Merges a partial column mapping with the default column map.
 * The provided overrides take precedence over defaults.
 *
 * @param overrides - Partial mapping to merge on top of defaults
 * @returns Merged ColumnMappingConfig
 */
export function mergeWithDefaultMapping(
  overrides: Partial<ColumnMapping>
): ColumnMappingConfig {
  return {
    ...DEFAULT_INGESTION_CONFIG,
    mapping: {
      ...DEFAULT_COLUMN_MAP,
      ...Object.fromEntries(
        Object.entries(overrides).map(([k, v]) => [normalizeColumnName(k), v])
      ),
    },
  }
}
