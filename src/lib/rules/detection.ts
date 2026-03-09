/**
 * Rules-Based Health Pattern Detection Engine
 *
 * Detects health flags for individual members and cross-member family patterns
 * using configurable thresholds and trend analysis.
 */

import type {
  FamilyMember,
  MetricObservation,
  MetricType,
  DailySummary,
  DetectionFlag,
  FamilyPattern,
  DetectionResult,
  MemberDetectionSummary,
  FlagSeverity,
  FamilyPatternType,
  SummaryScores,
} from '@/types'

// ============================================================
// CONFIGURABLE THRESHOLDS
// ============================================================

/**
 * Configurable thresholds for flag detection.
 * Values outside the normal range trigger flags at different severities.
 */
export const THRESHOLDS = {
  /** Fraction outside normal range that triggers a critical flag (vs warning) */
  CRITICAL_DEVIATION_FACTOR: 0.25,

  /** Minimum number of days of data needed for trend analysis */
  TREND_MIN_DAYS: 3,

  /** Number of days to analyze for trend detection */
  TREND_WINDOW_DAYS: 7,

  /** Fraction of members that must be affected to trigger a family pattern */
  FAMILY_PATTERN_MEMBER_FRACTION: 0.5,

  /** Minimum regression slope to consider a trend "declining" (normalized 0-100 scale) */
  DECLINING_SLOPE_THRESHOLD: -2.0,

  /** Readiness score below this is considered low */
  LOW_READINESS: 60,

  /** Stress score above this is considered high */
  HIGH_STRESS: 60,

  /** Sleep hours below this is considered low */
  LOW_SLEEP_HOURS: 6,

  /** Steps below this is considered low activity */
  LOW_STEPS: 5000,
} as const

// ============================================================
// UTILITIES
// ============================================================

/**
 * Computes a simple linear regression slope for an array of values.
 * Used to detect improving/declining trends.
 *
 * @param values - Array of numeric values (chronological order)
 * @returns Slope of the regression line (positive = improving, negative = declining)
 */
function computeSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0

  const sumX = (n * (n - 1)) / 2
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
  const sumY = values.reduce((a, b) => a + b, 0)
  const sumXY = values.reduce((acc, v, i) => acc + i * v, 0)

  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return 0
  return (n * sumXY - sumX * sumY) / denom
}

/**
 * Determines trend direction based on recent values.
 */
function detectTrend(
  values: number[],
  higherIsBetter: boolean
): 'improving' | 'declining' | 'stable' {
  if (values.length < THRESHOLDS.TREND_MIN_DAYS) return 'stable'

  const slope = computeSlope(values)
  const absSlope = Math.abs(slope)

  if (absSlope < 1.0) return 'stable'  // below noise floor

  const isGettingBetter = slope > 0 === higherIsBetter
  return isGettingBetter ? 'improving' : 'declining'
}

/**
 * Determines flag severity based on deviation from normal range.
 * Critical = far outside range; Warning = outside range; Info = borderline.
 */
function computeSeverity(
  value: number,
  min: number | null,
  max: number | null,
  higherIsBetter: boolean
): FlagSeverity | null {
  if (min === null && max === null) return null

  const rangeSize = (max ?? Infinity) - (min ?? -Infinity)
  const criticalPadding = rangeSize * THRESHOLDS.CRITICAL_DEVIATION_FACTOR

  if (min !== null && value < min) {
    return value < min - criticalPadding ? 'critical' : 'warning'
  }

  if (max !== null && value > max) {
    // Exceeding max is only bad when lower is better (stress, resting_hr).
    // For higher-is-better metrics (SpO2, steps), being above max is fine — no flag.
    if (higherIsBetter) return null
    return value > max + criticalPadding ? 'critical' : 'warning'
  }

  // Borderline: within 10% of the BAD boundary only.
  // - higher_is_better: bad boundary is the minimum → flag if close to min
  // - lower_is_better:  bad boundary is the maximum → flag if close to max
  const margin = rangeSize * 0.1
  if (higherIsBetter && min !== null && value < min + margin) return 'info'
  if (!higherIsBetter && max !== null && value > max - margin) return 'info'

  return null
}

/**
 * Generates a human-readable flag message.
 */
function buildFlagMessage(
  metricLabel: string,
  value: number,
  unit: string | null,
  min: number | null,
  max: number | null,
  severity: FlagSeverity,
  trend: 'improving' | 'declining' | 'stable'
): string {
  const formatted = unit ? `${value} ${unit}` : String(value)
  const rangeText =
    min !== null && max !== null
      ? `normal range: ${min}–${max}${unit ? ` ${unit}` : ''}`
      : min !== null
      ? `minimum recommended: ${min}${unit ? ` ${unit}` : ''}`
      : `maximum recommended: ${max}${unit ? ` ${unit}` : ''}`

  const trendText =
    trend === 'declining'
      ? ' (trending downward)'
      : trend === 'improving'
      ? ' (trending upward)'
      : ''

  if (severity === 'critical') {
    return `${metricLabel} is critically outside range at ${formatted} (${rangeText})${trendText}.`
  }
  if (severity === 'warning') {
    return `${metricLabel} is outside normal range at ${formatted} (${rangeText})${trendText}.`
  }
  return `${metricLabel} is borderline at ${formatted} (${rangeText})${trendText}.`
}

// ============================================================
// INDIVIDUAL MEMBER FLAG DETECTION
// ============================================================

/**
 * Detects health flags for a single family member by analyzing their
 * metric observations against normal ranges and trends.
 *
 * @param member - The family member to analyze
 * @param observations - All metric observations for this member (multiple dates)
 * @param metricTypes - All metric type definitions for reference ranges
 * @returns Array of DetectionFlag objects sorted by severity
 */
export function detectFlags(
  member: FamilyMember,
  observations: MetricObservation[],
  metricTypes: MetricType[]
): DetectionFlag[] {
  const flags: DetectionFlag[] = []

  if (observations.length === 0) return flags

  // Build metric type lookup
  const metricTypeById: Record<string, MetricType> = {}
  for (const mt of metricTypes) {
    metricTypeById[mt.id] = mt
  }

  // Group observations by metric_type_id, sort by date ascending
  const byMetric: Record<string, MetricObservation[]> = {}
  for (const obs of observations) {
    if (!byMetric[obs.metric_type_id]) {
      byMetric[obs.metric_type_id] = []
    }
    byMetric[obs.metric_type_id].push(obs)
  }

  for (const obs of Object.values(byMetric)) {
    obs.sort((a, b) => a.observed_date.localeCompare(b.observed_date))
  }

  // Get the most recent observation date
  const allDates = observations
    .map(o => o.observed_date)
    .sort()
    .reverse()
  const latestDate = allDates[0]

  for (const [metricTypeId, metricObs] of Object.entries(byMetric)) {
    const metricType = metricTypeById[metricTypeId]
    if (!metricType) continue

    // Get the latest observation for this metric
    const latestObs = metricObs.find(o => o.observed_date === latestDate)
    if (!latestObs || latestObs.value === null) continue

    const { value } = latestObs
    const { normal_range_min: min, normal_range_max: max, higher_is_better: higherIsBetter } = metricType

    const severity = computeSeverity(value, min, max, higherIsBetter)
    if (!severity) continue  // within normal range, no flag needed

    // Compute trend from recent values
    const recentObs = metricObs
      .slice(-THRESHOLDS.TREND_WINDOW_DAYS)
      .filter(o => o.value !== null)
    const trendValues = recentObs.map(o => o.value as number)
    const trend = detectTrend(trendValues, higherIsBetter)

    const message = buildFlagMessage(
      metricType.label,
      value,
      metricType.unit,
      min,
      max,
      severity,
      trend
    )

    flags.push({
      member_id: member.id,
      member_name: member.member_name,
      metric_key: metricType.key,
      metric_label: metricType.label,
      severity,
      message,
      current_value: value,
      normal_range_min: min,
      normal_range_max: max,
      trend: trend === 'stable' ? 'stable' : trend,
      trend_data: trendValues,
    })
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<FlagSeverity, number> = { critical: 0, warning: 1, info: 2 }
  flags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return flags
}

// ============================================================
// FAMILY PATTERN DETECTION
// ============================================================

/**
 * Detects cross-member family health patterns by analyzing daily summaries
 * across all members of the family.
 *
 * @param members - All family members
 * @param summaries - Latest daily summaries for each member
 * @returns Array of FamilyPattern objects
 */
export function detectFamilyPatterns(
  members: FamilyMember[],
  summaries: DailySummary[]
): FamilyPattern[] {
  if (members.length === 0 || summaries.length === 0) return []

  const patterns: FamilyPattern[] = []
  const totalMembers = members.length
  const minAffected = Math.max(2, Math.ceil(totalMembers * THRESHOLDS.FAMILY_PATTERN_MEMBER_FRACTION))

  // Build latest summary per member
  const latestSummaryByMember: Record<string, DailySummary> = {}
  for (const summary of summaries) {
    const existing = latestSummaryByMember[summary.member_id]
    if (!existing || summary.summary_date > existing.summary_date) {
      latestSummaryByMember[summary.member_id] = summary
    }
  }

  const memberSummaries = members
    .map(m => ({ member: m, summary: latestSummaryByMember[m.id] }))
    .filter(ms => ms.summary !== undefined)

  if (memberSummaries.length === 0) return []

  // Pattern: Multiple members with high stress
  const highStressMembers = memberSummaries.filter(
    ms => ms.summary.stress_score !== null && ms.summary.stress_score > THRESHOLDS.HIGH_STRESS
  )
  if (highStressMembers.length >= minAffected) {
    patterns.push({
      type: 'multiple_high_stress' as FamilyPatternType,
      affected_member_ids: highStressMembers.map(ms => ms.member.id),
      severity: highStressMembers.length === totalMembers ? 'critical' : 'warning',
      description: `${highStressMembers.length} family member(s) are showing elevated stress scores (>${THRESHOLDS.HIGH_STRESS}). This may indicate a shared stressor affecting the household.`,
    })
  }

  // Pattern: Multiple members with low readiness
  const lowReadinessMembers = memberSummaries.filter(
    ms => ms.summary.readiness_score !== null && ms.summary.readiness_score < THRESHOLDS.LOW_READINESS
  )
  if (lowReadinessMembers.length >= minAffected) {
    patterns.push({
      type: 'multiple_low_readiness' as FamilyPatternType,
      affected_member_ids: lowReadinessMembers.map(ms => ms.member.id),
      severity: lowReadinessMembers.length === totalMembers ? 'critical' : 'warning',
      description: `${lowReadinessMembers.length} family member(s) have low readiness/recovery scores (<${THRESHOLDS.LOW_READINESS}). The household may benefit from coordinated recovery time.`,
    })
  }

  // Pattern: Multiple members with poor sleep
  const poorSleepMembers = memberSummaries.filter(
    ms => ms.summary.sleep_score !== null && ms.summary.sleep_score < 50
  )
  if (poorSleepMembers.length >= minAffected) {
    patterns.push({
      type: 'multiple_poor_sleep' as FamilyPatternType,
      affected_member_ids: poorSleepMembers.map(ms => ms.member.id),
      severity: 'warning',
      description: `${poorSleepMembers.length} family member(s) have poor sleep scores. Consider reviewing household sleep routines and environment together.`,
    })
  }

  // Pattern: Multiple members with low activity
  const lowActivityMembers = memberSummaries.filter(
    ms => ms.summary.activity_score !== null && ms.summary.activity_score < 40
  )
  if (lowActivityMembers.length >= minAffected) {
    patterns.push({
      type: 'multiple_low_activity' as FamilyPatternType,
      affected_member_ids: lowActivityMembers.map(ms => ms.member.id),
      severity: 'info',
      description: `${lowActivityMembers.length} family member(s) have low activity scores. A family activity challenge or scheduled walks could help everyone.`,
    })
  }

  // Pattern: One member high activity + another low activity (accountability opportunity)
  const highActivityMembers = memberSummaries.filter(
    ms => ms.summary.activity_score !== null && ms.summary.activity_score > 80
  )
  if (highActivityMembers.length >= 1 && lowActivityMembers.length >= 1) {
    const affectedIds = [
      ...highActivityMembers.map(ms => ms.member.id),
      ...lowActivityMembers.map(ms => ms.member.id),
    ]
    patterns.push({
      type: 'high_low_activity_contrast' as FamilyPatternType,
      affected_member_ids: [...new Set(affectedIds)],
      severity: 'info',
      description: `Activity levels vary significantly across family members. More active members could be an accountability partner for less active ones.`,
      metadata: {
        high_activity_members: highActivityMembers.map(ms => ms.member.member_name),
        low_activity_members: lowActivityMembers.map(ms => ms.member.member_name),
      },
    })
  }

  // Pattern: One member with critical flags (needs attention)
  const criticalMembers = memberSummaries.filter(
    ms => ms.summary.flags && Array.isArray(ms.summary.flags) &&
      (ms.summary.flags as Array<{ severity: string }>).some(f => f.severity === 'critical')
  )
  if (criticalMembers.length === 1 && totalMembers > 1) {
    patterns.push({
      type: 'one_member_critical' as FamilyPatternType,
      affected_member_ids: criticalMembers.map(ms => ms.member.id),
      severity: 'critical',
      description: `${criticalMembers[0].member.member_name} has critical health metric flags that need attention. Other family members can provide support.`,
    })
  }

  return patterns
}

// ============================================================
// DAILY SUMMARY SCORE COMPUTATION
// ============================================================

/**
 * Computes normalized scores (0-100) for each health domain from raw observations.
 * Scores are relative to the defined normal ranges.
 *
 * @param observations - Metric observations for a single member for a single day
 * @param metricTypes - All metric type definitions
 * @returns SummaryScores with domain scores and overall
 */
export function computeDailySummaryScores(
  observations: MetricObservation[],
  metricTypes: MetricType[]
): SummaryScores {
  const metricTypeById: Record<string, MetricType> = {}
  for (const mt of metricTypes) {
    metricTypeById[mt.id] = mt
  }

  /**
   * Computes a 0-100 score for a single metric observation.
   * 100 = at or above/below the ideal end of the normal range.
   * 0 = severely outside the normal range.
   */
  function scoreMetric(value: number, mt: MetricType): number {
    const { normal_range_min: min, normal_range_max: max, higher_is_better } = mt
    if (min === null && max === null) return 50

    if (higher_is_better) {
      if (max !== null && value >= max) return 100
      if (min !== null && value <= 0) return 0
      if (min !== null && max !== null) {
        return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
      }
      if (min !== null) {
        return value >= min ? 100 : Math.max(0, (value / min) * 100)
      }
    } else {
      // Lower is better (e.g., stress, resting heart rate)
      if (min !== null && value <= min) return 100
      if (max !== null && value >= max * 1.5) return 0
      if (min !== null && max !== null) {
        return Math.max(0, Math.min(100, (1 - (value - min) / (max - min)) * 100))
      }
      if (max !== null) {
        return value <= max ? 100 : Math.max(0, (1 - (value - max) / max) * 100)
      }
    }

    return 50
  }

  // Accumulate scores by domain
  const domainScores: Record<string, number[]> = {
    sleep: [],
    activity: [],
    heart: [],
    stress: [],
    recovery: [],
  }

  for (const obs of observations) {
    const mt = metricTypeById[obs.metric_type_id]
    if (!mt || obs.value === null) continue

    const score = scoreMetric(obs.value, mt)
    const category = mt.category ?? 'activity'

    if (domainScores[category]) {
      domainScores[category].push(score)
    }
  }

  const avg = (arr: number[]): number | null =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null

  const sleep = avg(domainScores.sleep)
  const activity = avg(domainScores.activity)
  const heart = avg(domainScores.heart)
  const stress = avg(domainScores.stress)
  const recovery = avg(domainScores.recovery)

  // Readiness = weighted blend of sleep + recovery + heart
  const readinessComponents = [sleep, recovery, heart].filter((v): v is number => v !== null)
  const readiness = readinessComponents.length > 0
    ? readinessComponents.reduce((a, b) => a + b, 0) / readinessComponents.length
    : null

  // Overall = weighted average of all available domains
  const allComponents = [sleep, activity, heart, stress, recovery].filter((v): v is number => v !== null)
  const overall = allComponents.length > 0
    ? allComponents.reduce((a, b) => a + b, 0) / allComponents.length
    : null

  return {
    readiness_score: readiness !== null ? Math.round(readiness) : null,
    stress_score: stress !== null ? Math.round(100 - stress) : null,  // invert: high stress score = low score
    activity_score: activity !== null ? Math.round(activity) : null,
    sleep_score: sleep !== null ? Math.round(sleep) : null,
    overall_score: overall !== null ? Math.round(overall) : null,
  }
}

// ============================================================
// FULL DETECTION ORCHESTRATOR
// ============================================================

/**
 * Runs the full detection pipeline for a family:
 * - Individual member flags
 * - Family-level patterns
 * - Member summaries
 *
 * @param members - All family members
 * @param observationsByMember - Map of member_id -> observations
 * @param metricTypes - All metric type definitions
 * @param latestSummaries - Latest daily summaries for each member
 * @returns Full DetectionResult
 */
export function runDetection(
  members: FamilyMember[],
  observationsByMember: Record<string, MetricObservation[]>,
  metricTypes: MetricType[],
  latestSummaries: DailySummary[]
): DetectionResult {
  const allFlags: DetectionFlag[] = []
  const memberSummaries: Record<string, MemberDetectionSummary> = {}

  for (const member of members) {
    const observations = observationsByMember[member.id] ?? []
    const flags = detectFlags(member, observations, metricTypes)
    allFlags.push(...flags)

    const criticalCount = flags.filter(f => f.severity === 'critical').length
    const warningCount = flags.filter(f => f.severity === 'warning').length

    let overallStatus: MemberDetectionSummary['overall_status']
    if (criticalCount > 0) {
      overallStatus = 'critical'
    } else if (warningCount > 1) {
      overallStatus = 'needs_attention'
    } else if (warningCount === 1) {
      overallStatus = 'good'
    } else {
      overallStatus = 'excellent'
    }

    memberSummaries[member.id] = {
      member_id: member.id,
      member_name: member.member_name,
      total_flags: flags.length,
      critical_flags: criticalCount,
      warning_flags: warningCount,
      overall_status: overallStatus,
    }
  }

  const patterns = detectFamilyPatterns(members, latestSummaries)

  return {
    flags: allFlags,
    patterns,
    computed_at: new Date().toISOString(),
    member_summaries: memberSummaries,
  }
}
