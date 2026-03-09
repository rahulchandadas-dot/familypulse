/**
 * Excel Ingestion Pipeline
 *
 * Parses Excel files, normalizes rows, validates data, and upserts
 * observations and summaries to the Supabase database.
 */

import ExcelJS from 'exceljs'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeColumnName,
  resolveColumnHeader,
  DEFAULT_INGESTION_CONFIG,
} from './column-mapping'
import type {
  ColumnMappingConfig,
  RawRow,
  NormalizedRow,
  ValidationResult,
  IngestionResult,
  IngestionError,
  MetricType,
} from '@/types'
import { computeDailySummaryScores } from '@/lib/rules/detection'

// ============================================================
// HELPERS
// ============================================================

/**
 * Attempts to parse a value as a finite number.
 * Returns null for empty, non-numeric, or Infinity values.
 */
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return isFinite(n) ? n : null
}

/**
 * Attempts to parse a value as an ISO date string (YYYY-MM-DD).
 * Handles Excel serial numbers, ISO strings, and common US/EU formats.
 */
function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  // Excel serial date number (days since 1899-12-30)
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30)
    const date = new Date(excelEpoch.getTime() + value * 86400000)
    if (!isNaN(date.getTime())) {
      return date.toISOString().substring(0, 10)
    }
    return null
  }

  // String date
  if (typeof value === 'string') {
    const trimmed = value.trim()

    // Already ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.substring(0, 10)
    }

    // MM/DD/YYYY
    const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mdyMatch) {
      const [, m, d, y] = mdyMatch
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    // DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    // Try native Date parse as last resort
    const parsed = new Date(trimmed)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().substring(0, 10)
    }
  }

  if (value instanceof Date) {
    return value.toISOString().substring(0, 10)
  }

  return null
}

function parseString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

// ============================================================
// EXCEL PARSING
// ============================================================

/**
 * Parses an Excel file and returns raw rows with original column headers.
 *
 * @param filePath - Absolute path to the .xlsx or .xls file
 * @param config - Column mapping configuration
 * @returns Array of RawRow objects with row index and raw data
 */
export async function parseExcelFile(
  filePath: string,
  config: ColumnMappingConfig = DEFAULT_INGESTION_CONFIG
): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  // Resolve the sheet
  let worksheet: ExcelJS.Worksheet | undefined
  if (typeof config.sheetName === 'number') {
    worksheet = workbook.worksheets[config.sheetName]
  } else if (typeof config.sheetName === 'string') {
    worksheet = workbook.getWorksheet(config.sheetName)
  } else {
    worksheet = workbook.worksheets[0]
  }

  if (!worksheet) {
    const names = workbook.worksheets.map(ws => ws.name).join(', ')
    throw new Error(
      `Sheet "${config.sheetName ?? 0}" not found in workbook. ` +
      `Available sheets: ${names}`
    )
  }

  const headerRowIndex = (config.headerRow ?? 1) - 1  // 0-based
  const skipSet = new Set(config.skipRows ?? [])
  const rawRows: RawRow[] = []

  // Collect all rows as arrays of values
  const allRows: unknown[][] = []
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    allRows.push(row.values as unknown[])
  })

  if (allRows.length === 0) return []

  // ExcelJS row.values is 1-indexed (index 0 is undefined)
  const headerRow = allRows[headerRowIndex] ?? []
  const headers: string[] = []
  for (let c = 1; c < headerRow.length; c++) {
    const h = headerRow[c]
    headers[c] = h !== null && h !== undefined ? String(h) : ''
  }

  for (let i = headerRowIndex + 1; i < allRows.length; i++) {
    if (skipSet.has(i)) continue

    const rowArr = allRows[i]
    const rowData: Record<string, unknown> = {}
    let hasValue = false

    for (let c = 1; c < headers.length; c++) {
      const header = headers[c]
      if (!header) continue
      const cellValue = rowArr[c] ?? null
      // Unwrap ExcelJS rich text / formula result objects
      let val: unknown = cellValue
      if (val !== null && typeof val === 'object') {
        if ('result' in (val as object)) {
          val = (val as { result: unknown }).result
        } else if ('text' in (val as object)) {
          val = (val as { text: unknown }).text
        }
      }
      rowData[header] = val
      if (val !== null && val !== '') hasValue = true
    }

    if (!hasValue) continue
    rawRows.push({ rowIndex: i + 1, data: rowData })
  }

  return rawRows
}

// ============================================================
// ROW NORMALIZATION
// ============================================================

/**
 * Normalizes a raw Excel row into a typed NormalizedRow.
 * Maps Excel column headers to internal field names using the config.
 *
 * @param raw - Raw row from parseExcelFile
 * @param config - Column mapping configuration
 * @returns NormalizedRow if sufficient data present, null if row should be skipped
 */
export function normalizeRow(
  raw: RawRow,
  config: ColumnMappingConfig = DEFAULT_INGESTION_CONFIG
): NormalizedRow | null {
  const resolved: Record<string, unknown> = {}

  for (const [excelHeader, cellValue] of Object.entries(raw.data)) {
    const internalField = resolveColumnHeader(excelHeader, config.mapping)
    if (internalField) {
      // For duplicate mappings, last one wins (matches validateColumnMapping warning)
      resolved[internalField] = cellValue
    }
  }

  // member_id and date are essential — skip rows without them
  const rawMemberId = parseString(resolved['member_id'])
  const rawDate = parseDate(resolved['date'])

  if (!rawMemberId || !rawDate) {
    return null
  }

  return {
    rowIndex: raw.rowIndex,
    family_id: parseString(resolved['family_id']),
    member_id: rawMemberId,
    member_name: parseString(resolved['member_name']) ?? rawMemberId,
    relationship: parseString(resolved['relationship']),
    date: rawDate,
    steps: parseNumeric(resolved['steps']),
    sleep_hours: parseNumeric(resolved['sleep_hours']),
    resting_heart_rate: parseNumeric(resolved['resting_heart_rate']),
    hrv: parseNumeric(resolved['hrv']),
    stress_score: parseNumeric(resolved['stress_score']),
    readiness_score: parseNumeric(resolved['readiness_score']),
    calories_burned: parseNumeric(resolved['calories_burned']),
    activity_minutes: parseNumeric(resolved['activity_minutes']),
    blood_oxygen: parseNumeric(resolved['blood_oxygen']),
    glucose: parseNumeric(resolved['glucose']),
    notes: parseString(resolved['notes']),
  }
}

// ============================================================
// ROW VALIDATION
// ============================================================

const METRIC_BOUNDS: Record<string, { min: number; max: number }> = {
  steps: { min: 0, max: 100_000 },
  sleep_hours: { min: 0, max: 24 },
  resting_heart_rate: { min: 20, max: 250 },
  hrv: { min: 1, max: 300 },
  stress_score: { min: 0, max: 100 },
  readiness_score: { min: 0, max: 100 },
  calories_burned: { min: 0, max: 10_000 },
  activity_minutes: { min: 0, max: 1440 },
  blood_oxygen: { min: 50, max: 100 },
  glucose: { min: 20, max: 600 },
}

/**
 * Validates a normalized row for data quality issues.
 *
 * @param row - The NormalizedRow to validate
 * @returns ValidationResult with errors (blocking) and warnings (non-blocking)
 */
export function validateRow(row: NormalizedRow): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!row.member_id) {
    errors.push('member_id is required and missing')
  }

  if (!row.date) {
    errors.push('date is required and missing')
  } else {
    const d = new Date(row.date)
    if (isNaN(d.getTime())) {
      errors.push(`date "${row.date}" is not a valid date`)
    } else if (d > new Date()) {
      warnings.push(`date "${row.date}" is in the future`)
    } else if (d < new Date('2000-01-01')) {
      warnings.push(`date "${row.date}" is very old — possible parsing error`)
    }
  }

  // Validate metric ranges
  for (const [key, bounds] of Object.entries(METRIC_BOUNDS)) {
    const value = row[key as keyof NormalizedRow] as number | null
    if (value !== null && value !== undefined) {
      if (value < bounds.min || value > bounds.max) {
        warnings.push(
          `${key} value ${value} is outside expected range [${bounds.min}, ${bounds.max}]`
        )
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================
// DATABASE INGESTION
// ============================================================

/** Known metric keys and their corresponding NormalizedRow fields */
const METRIC_KEY_MAP: Record<string, keyof NormalizedRow> = {
  steps: 'steps',
  sleep_hours: 'sleep_hours',
  resting_heart_rate: 'resting_heart_rate',
  hrv: 'hrv',
  stress_score: 'stress_score',
  readiness_score: 'readiness_score',
  calories_burned: 'calories_burned',
  activity_minutes: 'activity_minutes',
  blood_oxygen: 'blood_oxygen',
  glucose: 'glucose',
}

/**
 * Ingests normalized rows into the Supabase database.
 *
 * Steps:
 * 1. Upsert families (from family_id field or default)
 * 2. Upsert family_members (keyed by external_id)
 * 3. Upsert metric_observations (one per metric per date per member)
 * 4. Compute and upsert daily_summaries
 * 5. Log results to ingestion_logs
 *
 * @param rows - Array of NormalizedRow to ingest
 * @param supabase - Supabase client (should be admin/service role)
 * @param fileName - Name of the source file (for logging)
 * @returns IngestionResult with counts and errors
 */
export async function ingestToDatabase(
  rows: NormalizedRow[],
  supabase: SupabaseClient,
  fileName = 'unknown'
): Promise<IngestionResult> {
  const ingestionErrors: IngestionError[] = []
  let rowsInserted = 0
  let rowsUpdated = 0

  // --- Create ingestion log entry ---
  const { data: logEntry, error: logCreateError } = await supabase
    .from('ingestion_logs')
    .insert({
      file_name: fileName,
      rows_processed: rows.length,
      rows_inserted: 0,
      rows_updated: 0,
      errors: [],
      status: 'running',
    })
    .select('id')
    .single()

  if (logCreateError || !logEntry) {
    console.error('Failed to create ingestion log:', logCreateError)
  }

  const logId = logEntry?.id ?? 'unknown'

  try {
    // --- Step 1: Load metric types once ---
    const { data: metricTypes, error: mtError } = await supabase
      .from('metric_types')
      .select('*')

    if (mtError || !metricTypes) {
      throw new Error(`Failed to load metric types: ${mtError?.message}`)
    }

    const metricTypeByKey: Record<string, MetricType> = {}
    for (const mt of metricTypes as MetricType[]) {
      metricTypeByKey[mt.key] = mt
    }

    // --- Step 2: Resolve or create families ---
    const familyExternalIds = [...new Set(rows.map(r => r.family_id).filter(Boolean))]
    const familyIdMap: Record<string, string> = {}  // external_id -> DB UUID
    let defaultFamilyId: string | null = null

    if (familyExternalIds.length > 0) {
      for (const extId of familyExternalIds) {
        const { data: existing } = await supabase
          .from('families')
          .select('id, name')
          .eq('name', extId!)
          .maybeSingle()

        if (existing) {
          familyIdMap[extId!] = existing.id
        } else {
          const { data: created, error: createErr } = await supabase
            .from('families')
            .insert({ name: extId! })
            .select('id')
            .single()

          if (createErr || !created) {
            ingestionErrors.push({
              row: 0,
              message: `Failed to create family "${extId}": ${createErr?.message}`,
            })
          } else {
            familyIdMap[extId!] = created.id
          }
        }
      }
    }

    // Ensure a default family exists for rows without family_id
    const rowsWithoutFamily = rows.filter(r => !r.family_id)
    if (rowsWithoutFamily.length > 0) {
      const { data: defaultFamily } = await supabase
        .from('families')
        .select('id')
        .eq('name', 'Default Family')
        .maybeSingle()

      if (defaultFamily) {
        defaultFamilyId = defaultFamily.id
      } else {
        const { data: created } = await supabase
          .from('families')
          .insert({ name: 'Default Family' })
          .select('id')
          .single()
        defaultFamilyId = created?.id ?? null
      }
    }

    // --- Step 3: Upsert family_members ---
    const memberExternalIds = [...new Set(rows.map(r => r.member_id))]
    const memberDbIdMap: Record<string, string> = {}  // external_id -> DB UUID

    for (const externalId of memberExternalIds) {
      const matchingRow = rows.find(r => r.member_id === externalId)!
      const resolvedFamilyId =
        (matchingRow.family_id ? familyIdMap[matchingRow.family_id] : null) ??
        defaultFamilyId

      if (!resolvedFamilyId) {
        ingestionErrors.push({
          row: matchingRow.rowIndex,
          message: `Cannot resolve family for member "${externalId}"`,
        })
        continue
      }

      const { data: existing } = await supabase
        .from('family_members')
        .select('id')
        .eq('external_id', externalId)
        .maybeSingle()

      if (existing) {
        memberDbIdMap[externalId] = existing.id
        // Update name/relationship in case they changed
        await supabase
          .from('family_members')
          .update({
            member_name: matchingRow.member_name,
            relationship: matchingRow.relationship,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        const { data: created, error: createErr } = await supabase
          .from('family_members')
          .insert({
            family_id: resolvedFamilyId,
            member_name: matchingRow.member_name,
            relationship: matchingRow.relationship,
            external_id: externalId,
          })
          .select('id')
          .single()

        if (createErr || !created) {
          ingestionErrors.push({
            row: matchingRow.rowIndex,
            message: `Failed to create member "${externalId}": ${createErr?.message}`,
          })
          continue
        }

        memberDbIdMap[externalId] = created.id

        // Create default profile
        await supabase.from('member_profiles').insert({
          member_id: created.id,
          avatar_color: '#6366f1',
        })
      }
    }

    // --- Step 4: Upsert metric_observations and compute daily_summaries ---
    const observationBatch: Array<{
      member_id: string
      metric_type_id: string
      observed_date: string
      value: number | null
      raw_value: string | null
      source: string
    }> = []

    for (const row of rows) {
      const memberDbId = memberDbIdMap[row.member_id]
      if (!memberDbId) continue

      for (const [metricKey, rowField] of Object.entries(METRIC_KEY_MAP)) {
        const metricType = metricTypeByKey[metricKey]
        if (!metricType) continue

        const value = row[rowField] as number | null
        if (value === null) continue

        observationBatch.push({
          member_id: memberDbId,
          metric_type_id: metricType.id,
          observed_date: row.date,
          value,
          raw_value: String(value),
          source: 'excel',
        })
      }
    }

    // Batch upsert observations in chunks of 500
    const CHUNK_SIZE = 500
    for (let i = 0; i < observationBatch.length; i += CHUNK_SIZE) {
      const chunk = observationBatch.slice(i, i + CHUNK_SIZE)
      const { error: upsertErr, count } = await supabase
        .from('metric_observations')
        .upsert(chunk, {
          onConflict: 'member_id,metric_type_id,observed_date',
          count: 'exact',
        })

      if (upsertErr) {
        ingestionErrors.push({
          row: i,
          message: `Batch upsert failed: ${upsertErr.message}`,
        })
      } else {
        rowsInserted += count ?? chunk.length
      }
    }

    // --- Step 5: Compute and upsert daily_summaries ---
    // Group rows by member + date
    const memberDateGroups: Map<string, NormalizedRow[]> = new Map()
    for (const row of rows) {
      const key = `${row.member_id}::${row.date}`
      if (!memberDateGroups.has(key)) {
        memberDateGroups.set(key, [])
      }
      memberDateGroups.get(key)!.push(row)
    }

    for (const [key, groupRows] of memberDateGroups.entries()) {
      const [externalId, summaryDate] = key.split('::')
      const memberDbId = memberDbIdMap[externalId]
      if (!memberDbId) continue

      // Build metric observations array for scoring
      const pseudoObservations = groupRows.flatMap(row =>
        Object.entries(METRIC_KEY_MAP).flatMap(([metricKey, rowField]) => {
          const val = row[rowField] as number | null
          const mt = metricTypeByKey[metricKey]
          if (val === null || !mt) return []
          return [{
            id: '',
            member_id: memberDbId,
            metric_type_id: mt.id,
            observed_date: summaryDate,
            value: val,
            raw_value: null,
            source: 'excel',
            created_at: new Date().toISOString(),
            metric_type: mt,
          }]
        })
      )

      const scores = computeDailySummaryScores(
        pseudoObservations,
        metricTypes as MetricType[]
      )

      await supabase
        .from('daily_summaries')
        .upsert({
          member_id: memberDbId,
          summary_date: summaryDate,
          readiness_score: scores.readiness_score,
          stress_score: scores.stress_score,
          activity_score: scores.activity_score,
          sleep_score: scores.sleep_score,
          overall_score: scores.overall_score,
          flags: [],
        }, { onConflict: 'member_id,summary_date' })

      rowsUpdated++
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ingestionErrors.push({ row: 0, message: `Fatal ingestion error: ${message}` })

    // Update log to error status
    if (logId !== 'unknown') {
      await supabase
        .from('ingestion_logs')
        .update({
          status: 'error',
          errors: ingestionErrors,
          rows_inserted: rowsInserted,
          rows_updated: rowsUpdated,
          completed_at: new Date().toISOString(),
        })
        .eq('id', logId)
    }

    return {
      logId,
      rowsProcessed: rows.length,
      rowsInserted,
      rowsUpdated,
      errors: ingestionErrors,
      status: 'error',
    }
  }

  const finalStatus = ingestionErrors.length > 0 ? 'error' : 'success'

  // Update ingestion log
  if (logId !== 'unknown') {
    await supabase
      .from('ingestion_logs')
      .update({
        rows_inserted: rowsInserted,
        rows_updated: rowsUpdated,
        errors: ingestionErrors,
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('id', logId)
  }

  return {
    logId,
    rowsProcessed: rows.length,
    rowsInserted,
    rowsUpdated,
    errors: ingestionErrors,
    status: finalStatus,
  }
}

// ============================================================
// FULL PIPELINE ORCHESTRATOR
// ============================================================

/**
 * Runs the complete ingestion pipeline: parse -> validate -> ingest.
 *
 * @param filePath - Path to the Excel file
 * @param config - Column mapping configuration
 * @param supabase - Supabase admin client
 * @returns IngestionResult
 */
export async function runIngestionPipeline(
  filePath: string,
  config: ColumnMappingConfig = DEFAULT_INGESTION_CONFIG,
  supabase: SupabaseClient
): Promise<IngestionResult & { skippedRows: number; validationWarnings: string[] }> {
  const fileName = filePath.split('/').pop() ?? filePath

  // 1. Parse Excel
  const rawRows = await parseExcelFile(filePath, config)

  // 2. Normalize + validate rows
  const normalizedRows: NormalizedRow[] = []
  const ingestionErrors: IngestionError[] = []
  const validationWarnings: string[] = []
  let skippedRows = 0

  for (const raw of rawRows) {
    const normalized = normalizeRow(raw, config)
    if (!normalized) {
      skippedRows++
      continue
    }

    const validation = validateRow(normalized)
    if (!validation.valid) {
      ingestionErrors.push({
        row: raw.rowIndex,
        message: validation.errors.join('; '),
      })
      skippedRows++
      continue
    }

    for (const warning of validation.warnings) {
      validationWarnings.push(`Row ${raw.rowIndex}: ${warning}`)
    }

    normalizedRows.push(normalized)
  }

  if (normalizedRows.length === 0) {
    return {
      logId: 'skipped',
      rowsProcessed: rawRows.length,
      rowsInserted: 0,
      rowsUpdated: 0,
      errors: ingestionErrors,
      status: 'error',
      skippedRows,
      validationWarnings,
    }
  }

  // 3. Ingest to database
  const result = await ingestToDatabase(normalizedRows, supabase, fileName)

  return {
    ...result,
    skippedRows,
    validationWarnings,
    errors: [...ingestionErrors, ...result.errors],
  }
}
