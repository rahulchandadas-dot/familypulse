/**
 * Recommendation Engine
 *
 * Generates family-level health recommendations by combining:
 * 1. Rules-based candidate generation from detection results
 * 2. Approved source retrieval for grounding
 * 3. LLM (Claude claude-sonnet-4-6) for natural language generation
 * 4. Database persistence with citations
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GROUNDING_SYSTEM_PROMPT,
  DISCLAIMER_TEXT,
  retrieveRelevantSources,
  formatSourcesForPrompt,
  extractCitationsFromText,
  validateCitations,
} from '@/lib/retrieval/grounding'
import { APPROVED_SOURCES } from '@/lib/retrieval/sources'
import type {
  DetectionResult,
  FamilyPattern,
  DetectionFlag,
  Recommendation,
  RecommendationCandidate,
  FamilyPatternType,
  ActionType,
  Priority,
  EvidenceLevel,
} from '@/types'

// ============================================================
// RECOMMENDATION CANDIDATE DEFINITIONS
// ============================================================

/**
 * Maps family patterns and individual flags to recommendation candidates.
 * These are deterministic — the LLM only writes the explanation text.
 */
export const CANDIDATE_DEFINITIONS: Omit<RecommendationCandidate, 'affected_member_ids'>[] = [
  {
    id: 'stress_family_walk',
    title: 'Schedule a Daily Family Walk',
    action_type: 'activity',
    priority: 1,
    trigger_patterns: ['multiple_high_stress', 'multiple_low_activity'],
    trigger_flags: ['stress_score'],
    suggested_explanation:
      'Multiple family members are showing elevated stress. A 20–30 minute daily walk together can help reduce cortisol levels and improve mood for everyone.',
    relevant_topics: ['stress', 'activity', 'exercise', 'mental_health'],
    evidence_level: 'strong',
  },
  {
    id: 'household_sleep_routine',
    title: 'Establish a Household Sleep Routine',
    action_type: 'sleep',
    priority: 1,
    trigger_patterns: ['multiple_poor_sleep', 'multiple_low_readiness'],
    trigger_flags: ['sleep_hours', 'readiness_score'],
    suggested_explanation:
      'Several family members are not getting enough quality sleep. Setting consistent bedtimes, dimming lights an hour before bed, and reducing screen time can improve sleep across the household.',
    relevant_topics: ['sleep', 'sleep_hours', 'recovery', 'readiness'],
    evidence_level: 'strong',
  },
  {
    id: 'activity_accountability_partner',
    title: 'Start a Family Activity Challenge',
    action_type: 'activity',
    priority: 2,
    trigger_patterns: ['high_low_activity_contrast', 'multiple_low_activity'],
    trigger_flags: ['steps', 'activity_minutes'],
    suggested_explanation:
      'Activity levels vary across the family. More active members can buddy up with less active ones for step challenges, weekend hikes, or evening walks.',
    relevant_topics: ['activity', 'steps', 'exercise', 'accountability'],
    evidence_level: 'moderate',
  },
  {
    id: 'stress_reduction_together',
    title: 'Try a Family Stress-Reduction Practice',
    action_type: 'stress',
    priority: 2,
    trigger_patterns: ['multiple_high_stress'],
    trigger_flags: ['stress_score', 'hrv'],
    suggested_explanation:
      'Shared stress management practices like breathing exercises, a short meditation, or simply unplugging from devices together for an hour can lower household stress levels.',
    relevant_topics: ['stress', 'stress_score', 'hrv', 'mental_health'],
    evidence_level: 'moderate',
  },
  {
    id: 'recovery_day',
    title: 'Plan a Low-Intensity Recovery Day',
    action_type: 'activity',
    priority: 2,
    trigger_patterns: ['multiple_low_readiness'],
    trigger_flags: ['readiness_score', 'hrv'],
    suggested_explanation:
      'Readiness scores are low across the family. Consider scheduling a low-key day with light activity, extra hydration, and earlier bedtimes to allow proper recovery.',
    relevant_topics: ['recovery', 'readiness_score', 'hrv', 'sleep'],
    evidence_level: 'moderate',
  },
  {
    id: 'nutrition_family_meal',
    title: 'Add a Weekly Shared Healthy Meal',
    action_type: 'nutrition',
    priority: 3,
    trigger_patterns: ['multiple_low_activity', 'multiple_low_readiness'],
    trigger_flags: ['glucose', 'calories_burned'],
    suggested_explanation:
      'Cooking and eating a nutritious meal together once a week can improve dietary habits, strengthen family bonds, and support stable blood glucose levels.',
    relevant_topics: ['nutrition', 'glucose', 'diet', 'family'],
    evidence_level: 'general',
  },
  {
    id: 'social_support_critical_member',
    title: 'Rally Around a Family Member Who Needs Support',
    action_type: 'social',
    priority: 1,
    trigger_patterns: ['one_member_critical'],
    trigger_flags: [],
    suggested_explanation:
      'One family member is showing critical health signals. Extra social support, checking in daily, and helping with daily tasks can reduce their burden significantly.',
    relevant_topics: ['stress', 'recovery', 'social_support', 'mental_health'],
    evidence_level: 'moderate',
  },
  {
    id: 'sleep_individual_low',
    title: 'Improve Sleep Duration',
    action_type: 'sleep',
    priority: 1,
    trigger_patterns: [],
    trigger_flags: ['sleep_hours'],
    suggested_explanation:
      'Sleep duration is below recommended levels. Prioritizing 7–9 hours of sleep per night improves mood, cognitive function, and physical recovery.',
    relevant_topics: ['sleep', 'sleep_hours', 'recovery'],
    evidence_level: 'strong',
  },
  {
    id: 'hrv_recovery_focus',
    title: 'Focus on HRV Recovery',
    action_type: 'stress',
    priority: 2,
    trigger_patterns: [],
    trigger_flags: ['hrv'],
    suggested_explanation:
      'Heart rate variability (HRV) is lower than optimal, suggesting the autonomic nervous system needs support. Light exercise, quality sleep, and stress reduction can improve HRV over time.',
    relevant_topics: ['hrv', 'heart_rate_variability', 'recovery', 'stress'],
    evidence_level: 'moderate',
  },
]

// ============================================================
// CANDIDATE GENERATION (RULES-BASED)
// ============================================================

/**
 * Generates recommendation candidates from detection results using deterministic rules.
 * Maps family patterns and individual member flags to appropriate candidates.
 *
 * @param patterns - Family-level patterns detected
 * @param flags - Individual member flags
 * @returns Array of RecommendationCandidate with affected_member_ids populated
 */
export function generateCandidates(
  patterns: FamilyPattern[],
  flags: DetectionFlag[]
): RecommendationCandidate[] {
  const triggered = new Map<string, RecommendationCandidate>()

  const patternTypes = new Set(patterns.map(p => p.type))
  const flaggedMetrics = new Set(flags.map(f => f.metric_key))

  for (const def of CANDIDATE_DEFINITIONS) {
    // Check if any trigger pattern matches
    const patternMatch = def.trigger_patterns.some(pt => patternTypes.has(pt as FamilyPatternType))
    // Check if any trigger flag metric matches
    const flagMatch = def.trigger_flags.length === 0 ||
      def.trigger_flags.some(fk => flaggedMetrics.has(fk))

    if (!patternMatch && !flagMatch) continue

    // Collect affected member IDs
    const affectedMemberIds = new Set<string>()

    // From matching patterns
    for (const pattern of patterns) {
      if (def.trigger_patterns.includes(pattern.type)) {
        for (const mid of pattern.affected_member_ids) {
          affectedMemberIds.add(mid)
        }
      }
    }

    // From matching flags
    for (const flag of flags) {
      if (def.trigger_flags.includes(flag.metric_key)) {
        affectedMemberIds.add(flag.member_id)
      }
    }

    // If no members were collected from patterns/flags, fall back to
    // members with critical-severity flags (catches patterns like one_member_critical
    // that may not directly populate member IDs)
    if (affectedMemberIds.size === 0) {
      for (const flag of flags.filter(f => f.severity === 'critical')) {
        affectedMemberIds.add(flag.member_id)
      }
    }

    // Still empty — skip this candidate, it has no actionable target
    if (affectedMemberIds.size === 0) continue

    triggered.set(def.id, {
      ...def,
      affected_member_ids: [...affectedMemberIds],
    })
  }

  const all = [...triggered.values()].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.affected_member_ids.length - a.affected_member_ids.length
  })

  // Deduplicate: keep only one candidate per action_type.
  // Since the list is already sorted by priority, the first one per action_type wins.
  const seenActionTypes = new Set<string>()
  return all.filter(c => {
    if (seenActionTypes.has(c.action_type)) return false
    seenActionTypes.add(c.action_type)
    return true
  })
}

// ============================================================
// LLM-ENHANCED RECOMMENDATION GENERATION
// ============================================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface EnhancedRecommendation {
  title: string
  explanation: string
  evidence_level: EvidenceLevel
}

/** Per-member data snapshot passed to the LLM for personalization */
interface MemberDataSnapshot {
  name: string
  firstName: string
  relationship: string | null
  flaggedMetrics: Array<{
    label: string
    key: string
    currentValue: number | null
    unit: string | null
    normalMin: number | null
    normalMax: number | null
    trend: string | null
    consecutiveDaysOutOfRange: number
    recentValues: number[]   // last 3–5 days, chronological
  }>
}

/**
 * Builds a fully personalized recommendation title + explanation using only
 * the structured data — no LLM required. Used as primary output when the LLM
 * is unavailable, and as the base context when it is available.
 */
function buildDeterministicRecommendation(
  candidate: RecommendationCandidate,
  snapshots: MemberDataSnapshot[]
): { title: string; explanation: string } {
  if (snapshots.length === 0) {
    return { title: candidate.title, explanation: candidate.suggested_explanation }
  }

  // Helper: describe a metric reading in plain English
  const describeMetric = (
    m: MemberDataSnapshot['flaggedMetrics'][0],
    firstName: string
  ): string => {
    // Don't append dimensionless units like "score" — they read awkwardly
    const unitStr = m.unit && !['score', 'index', 'level'].includes(m.unit.toLowerCase())
      ? ` ${m.unit}` : ''
    const val = m.currentValue !== null ? `${m.currentValue}${unitStr}` : 'an abnormal reading'
    const days = m.consecutiveDaysOutOfRange > 1
      ? ` for the past ${m.consecutiveDaysOutOfRange} days`
      : ''
    const trend = m.trend === 'declining' ? ', and it\'s getting worse'
      : m.trend === 'improving' ? ', but improving'
      : ''
    return `${firstName}'s ${m.label.toLowerCase()} has been ${val}${days}${trend}`
  }

  const firstNames = snapshots.map(s => s.firstName)
  const nameList = firstNames.length === 1
    ? firstNames[0]
    : firstNames.length === 2
    ? `${firstNames[0]} and ${firstNames[1]}`
    : `${firstNames.slice(0, -1).join(', ')}, and ${firstNames[firstNames.length - 1]}`

  // Build per-member metric descriptions
  const metricDescriptions = snapshots
    .flatMap(s => s.flaggedMetrics.map(m => describeMetric(m, s.firstName)))
    .filter(Boolean)

  const observationSentence = metricDescriptions.length > 0
    ? metricDescriptions.join('; ') + '.'
    : ''

  // Action sentence — specific per action_type and pattern
  const actionType = candidate.action_type
  let whySentence = ''
  let actionSentence = ''

  if (actionType === 'sleep') {
    const normalMin = snapshots[0]?.flaggedMetrics.find(m => m.key === 'sleep_hours')?.normalMin ?? 7
    whySentence = 'Consistent sleep improves recovery, mood, and cognitive performance for everyone in the household.'
    actionSentence = snapshots.length > 1
      ? `This week, ${nameList} should agree on a shared bedtime at least ${normalMin} hours before their wake time — turn off screens 30 minutes before and dim the lights together.`
      : `${nameList} should move bedtime ${normalMin} hours before their usual wake time tonight, starting with a consistent wind-down routine.`
  } else if (actionType === 'activity') {
    const lowStepMember = snapshots.find(s => s.flaggedMetrics.some(m => m.key === 'steps' || m.key === 'activity_minutes'))
    const highActivityMember = snapshots.find(s => s !== lowStepMember)
    if (highActivityMember && lowStepMember) {
      whySentence = 'Pairing a more active family member with a less active one is one of the most effective ways to build a lasting movement habit.'
      actionSentence = `${highActivityMember.firstName} can help motivate ${lowStepMember.firstName} — try a shared 20-minute walk or activity session together this week.`
    } else {
      whySentence = 'Regular movement reduces stress, improves sleep quality, and supports cardiovascular health.'
      actionSentence = `${nameList} should schedule at least one shared physical activity this week — even a 20-minute walk counts.`
    }
  } else if (actionType === 'stress') {
    const worstStress = snapshots.reduce((prev, curr) => {
      const pVal = prev.flaggedMetrics.find(m => m.key === 'stress_score')?.currentValue ?? 0
      const cVal = curr.flaggedMetrics.find(m => m.key === 'stress_score')?.currentValue ?? 0
      return cVal > pVal ? curr : prev
    }, snapshots[0])
    whySentence = 'Elevated stress suppresses immune function and disrupts sleep — addressing it as a family makes it more sustainable.'
    actionSentence = snapshots.length > 1
      ? `${nameList} should carve out 15–20 minutes together tonight to decompress — a walk outside, a no-screens dinner, or a simple breathing exercise can meaningfully reduce physiological stress.`
      : `${worstStress.firstName} should take a deliberate recovery break today — 15 minutes of calm activity (a walk, breathing exercises, or quiet time) can reduce stress markers.`
  } else if (actionType === 'social') {
    const criticalMember = snapshots[0]
    whySentence = 'Social support is one of the strongest protective factors for health during periods of stress or low readiness.'
    actionSentence = `The family should check in on ${criticalMember.firstName} today — offering to help with tasks, planning a low-key activity together, or simply spending time together can make a real difference.`
  } else if (actionType === 'nutrition') {
    whySentence = 'Shared meals with whole foods improve dietary habits and strengthen family routines.'
    actionSentence = `${nameList} should plan one shared home-cooked meal this week focused on vegetables, protein, and fiber to support stable energy and blood sugar.`
  } else {
    whySentence = 'Addressing this together as a family makes it more likely to stick.'
    actionSentence = `${nameList} should take one concrete step this week to address this pattern.`
  }

  // Build personalized title
  const title = snapshots.length === 1
    ? `Help ${firstNames[0]} ${actionType === 'sleep' ? 'get better sleep' : actionType === 'stress' ? 'reduce stress' : actionType === 'activity' ? 'move more' : 'recover'}`
    : actionType === 'sleep'
    ? `${nameList}: improve your shared sleep routine`
    : actionType === 'stress'
    ? `Help ${nameList} decompress together`
    : actionType === 'activity'
    ? `Get ${nameList} moving together`
    : actionType === 'social'
    ? `Rally around ${snapshots[0].firstName}`
    : candidate.title

  const explanation = [observationSentence, whySentence, actionSentence]
    .filter(Boolean)
    .join(' ')

  return { title, explanation }
}

/**
 * Builds a rich natural-language context string for affected members,
 * including their actual readings, how long they've been out of range,
 * and recent trend values. This is fed directly into the LLM prompt.
 */
function buildMemberDataContext(snapshots: MemberDataSnapshot[]): string {
  if (snapshots.length === 0) return 'No specific member data available.'

  return snapshots.map(s => {
    const metricLines = s.flaggedMetrics.map(m => {
      const rangeStr = m.normalMin !== null && m.normalMax !== null
        ? `normal: ${m.normalMin}–${m.normalMax}${m.unit ? ` ${m.unit}` : ''}`
        : ''
      const daysStr = m.consecutiveDaysOutOfRange > 1
        ? ` (${m.consecutiveDaysOutOfRange} consecutive days out of range)`
        : ''
      const recentStr = m.recentValues.length > 1
        ? ` — recent values: ${m.recentValues.map(v => `${v}${m.unit ? m.unit : ''}`).join(', ')}`
        : ''
      const trendStr = m.trend ? `, trend: ${m.trend}` : ''
      return `  • ${m.label}: ${m.currentValue}${m.unit ? ` ${m.unit}` : ''} (${rangeStr}${trendStr})${daysStr}${recentStr}`
    }).join('\n')

    return `${s.name} (${s.relationship ?? 'family member'}):\n${metricLines}`
  }).join('\n\n')
}

/**
 * Calls Claude claude-sonnet-4-6 to write a specific, personalized recommendation
 * grounded in the actual member data and approved sources.
 */
async function enhanceWithLLM(
  candidate: RecommendationCandidate,
  memberSnapshots: MemberDataSnapshot[],
  sources: Awaited<ReturnType<typeof retrieveRelevantSources>>
): Promise<EnhancedRecommendation> {
  // Always build the deterministic personalized version first.
  // This ensures recommendations are specific even if the LLM is unavailable.
  const deterministic = buildDeterministicRecommendation(candidate, memberSnapshots)

  const sourcesPrompt = formatSourcesForPrompt(sources)
  const memberDataContext = buildMemberDataContext(memberSnapshots)
  const memberFirstNames = memberSnapshots.map(s => s.firstName)

  const systemPrompt = `You are a family health advisor. You refine personalized health recommendations for families based on their actual wearable data.

${GROUNDING_SYSTEM_PROMPT}

Rules:
- ALWAYS use the family members' actual first names — never say "family member" or "some members"
- ALWAYS reference their specific metric readings and values
- Keep it to 2–3 sentences
- Warm, conversational tone — like a knowledgeable friend, not a clinical report
- No diagnosis language
- If you cite a source, use only the approved sources provided

${sourcesPrompt}`

  const userMessage = `Refine this family health recommendation. Keep the specificity and names — just make it flow more naturally and add a source citation if relevant.

CURRENT RECOMMENDATION:
Title: ${deterministic.title}
Text: ${deterministic.explanation}

ACTUAL MEMBER DATA (for reference):
${memberDataContext}

Return JSON with two fields:
- "title": improved title (5–8 words, use first names, specific)
- "explanation": improved 2–3 sentence explanation (keep all names and specific numbers, add source citation if relevant)

Return ONLY valid JSON. No preamble.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: userMessage }],
      system: systemPrompt,
    })

    const content = message.content[0]
    if (content.type !== 'text') return { ...deterministic, evidence_level: candidate.evidence_level }

    // Parse the JSON response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { ...deterministic, evidence_level: candidate.evidence_level }

    const parsed = JSON.parse(jsonMatch[0]) as { title?: string; explanation?: string }
    const title = (parsed.title ?? deterministic.title).replace(/[.!?]$/, '')
    const explanation = parsed.explanation ?? deterministic.explanation

    // Sanity check: if LLM dropped the names, fall back to deterministic
    const hasNames = memberFirstNames.some(n => explanation.includes(n))
    if (!hasNames) return { ...deterministic, evidence_level: candidate.evidence_level }

    return { title, explanation, evidence_level: candidate.evidence_level }
  } catch (err) {
    // LLM unavailable — deterministic output is already personalized
    console.error('LLM enhancement failed for candidate:', candidate.id, (err as Error).message)
    return { ...deterministic, evidence_level: candidate.evidence_level }
  }
}

// ============================================================
// MAIN GENERATE FUNCTION
// ============================================================

/**
 * Generates and persists family health recommendations.
 *
 * Pipeline:
 * 1. Generate deterministic candidates from detection results
 * 2. Retrieve relevant approved sources for each candidate
 * 3. Call Claude claude-sonnet-4-6 to write enhanced explanations
 * 4. Save recommendations to DB with source citations
 * 5. Deactivate old recommendations
 *
 * @param familyId - The family's database UUID
 * @param detectionResult - Output from the detection engine
 * @param memberIdToName - Map of member DB UUID -> display name
 * @param supabase - Supabase admin client
 * @returns Array of persisted Recommendation objects
 */
export async function generateRecommendations(
  familyId: string,
  detectionResult: DetectionResult,
  memberIdToName: Record<string, string>,
  supabase: SupabaseClient,
  allObservations?: Record<string, Array<{
    metric_type_id: string
    observed_date: string
    value: number | null
    metric_type?: { key: string; label: string; unit: string | null; normal_range_min: number | null; normal_range_max: number | null }
  }>>,
  memberRelationships?: Record<string, string | null>
): Promise<Recommendation[]> {
  const { flags, patterns } = detectionResult

  // Step 1: Generate rule-based candidates
  const candidates = generateCandidates(patterns, flags)

  if (candidates.length === 0) {
    console.log('No recommendation candidates triggered for family:', familyId)
    return []
  }

  // Cap at top 5 recommendations per generation
  const topCandidates = candidates.slice(0, 5)

  // Step 2: Deactivate previous recommendations
  await supabase
    .from('recommendations')
    .update({ is_active: false })
    .eq('family_id', familyId)
    .eq('is_active', true)

  // Step 3: Process each candidate
  const savedRecommendations: Recommendation[] = []

  for (const candidate of topCandidates) {
    // Retrieve relevant sources
    const sources = await retrieveRelevantSources(
      candidate.action_type,
      candidate.relevant_topics,
      supabase
    )

    // Build rich member snapshots for affected members
    const memberSnapshots: MemberDataSnapshot[] = candidate.affected_member_ids
      .map(memberId => {
        const fullName = memberIdToName[memberId]
        if (!fullName) return null

        // Find flags for this member relevant to this candidate.
        // If no specific trigger_flags defined, use the member's most severe flags (up to 3).
        const memberFlags = flags.filter(f => f.member_id === memberId)
        const relevantFlags = candidate.trigger_flags.length > 0
          ? memberFlags.filter(f => candidate.trigger_flags.includes(f.metric_key))
          : memberFlags
              .sort((a, b) => {
                const order = { critical: 0, warning: 1, info: 2 }
                return order[a.severity] - order[b.severity]
              })
              .slice(0, 3)

        // Build flagged metric details with recent values
        const flaggedMetrics = relevantFlags.map(f => {
          const memberObs = allObservations?.[memberId] ?? []
          // Get recent values for this metric (last 5 days, chronological)
          const metricObs = memberObs
            .filter(o => {
              const mt = o.metric_type
              return mt?.key === f.metric_key && o.value !== null
            })
            .sort((a, b) => a.observed_date.localeCompare(b.observed_date))
            .slice(-5)

          const recentValues = metricObs
            .map(o => Math.round((o.value ?? 0) * 10) / 10)

          // Count consecutive days out of range
          let consecutiveDays = 0
          for (let i = metricObs.length - 1; i >= 0; i--) {
            const v = metricObs[i].value ?? 0
            const min = f.normal_range_min
            const max = f.normal_range_max
            const outOfRange = (min !== null && v < min) || (max !== null && v > max)
            if (outOfRange) consecutiveDays++
            else break
          }

          const firstObs = metricObs[0]
          const mt = firstObs?.metric_type

          return {
            label: f.metric_label,
            key: f.metric_key,
            currentValue: f.current_value,
            unit: mt?.unit ?? null,
            normalMin: f.normal_range_min,
            normalMax: f.normal_range_max,
            trend: f.trend ?? null,
            consecutiveDaysOutOfRange: Math.max(consecutiveDays, 1),
            recentValues,
          }
        })

        return {
          name: fullName,
          firstName: fullName.split(' ')[0],
          relationship: memberRelationships?.[memberId] ?? null,
          flaggedMetrics,
        } satisfies MemberDataSnapshot
      })
      .filter((s): s is MemberDataSnapshot => s !== null)

    // Enhance with LLM using rich member data
    const enhanced = await enhanceWithLLM(candidate, memberSnapshots, sources)

    // Extract and validate citations from LLM text
    const rawCitations = extractCitationsFromText(enhanced.explanation)
    const validCitations = validateCitations(rawCitations, APPROVED_SOURCES)

    // Set expiry to 7 days from now
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Save recommendation to DB
    const { data: savedRec, error: saveErr } = await supabase
      .from('recommendations')
      .insert({
        family_id: familyId,
        title: enhanced.title,
        explanation: enhanced.explanation,
        action_type: candidate.action_type as ActionType,
        priority: candidate.priority as Priority,
        affected_member_ids: candidate.affected_member_ids,
        evidence_level: enhanced.evidence_level as EvidenceLevel,
        is_active: true,
        expires_at: expiresAt,
      })
      .select('*')
      .single()

    if (saveErr || !savedRec) {
      console.error('Failed to save recommendation:', candidate.id, saveErr)
      continue
    }

    // Save citations
    if (validCitations.length > 0) {
      for (const citation of validCitations) {
        // Look up or create source_document for this citation
        const { data: existingDoc } = await supabase
          .from('source_documents')
          .select('id')
          .eq('url', citation.url ?? '')
          .maybeSingle()

        let sourceDocId = existingDoc?.id

        if (!sourceDocId && citation.url) {
          const { data: newDoc } = await supabase
            .from('source_documents')
            .insert({
              title: citation.title,
              source_org: citation.source_org,
              url: citation.url,
              content_summary: citation.excerpt,
              topic_tags: candidate.relevant_topics,
              is_approved: true,
            })
            .select('id')
            .single()
          sourceDocId = newDoc?.id
        }

        if (sourceDocId) {
          await supabase.from('source_citations').insert({
            source_document_id: sourceDocId,
            recommendation_id: savedRec.id,
            excerpt: citation.excerpt,
            relevance_score: 1.0,
          })
        }
      }
    }

    savedRecommendations.push(savedRec as Recommendation)
  }

  return savedRecommendations
}

// ============================================================
// BATCH PIPELINE ORCHESTRATOR
// ============================================================

/**
 * Runs the full recommendation pipeline for a family.
 * Fetches required data, runs detection, generates recommendations.
 *
 * @param familyId - Family database UUID
 * @param supabase - Supabase admin client
 * @returns Generated recommendations
 */
export async function runRecommendationPipeline(
  familyId: string,
  supabase: SupabaseClient
): Promise<{ recommendations: Recommendation[]; error: string | null }> {
  try {
    // Load family members
    const { data: members, error: membersErr } = await supabase
      .from('family_members')
      .select('*')
      .eq('family_id', familyId)

    if (membersErr || !members) {
      return { recommendations: [], error: `Failed to load members: ${membersErr?.message}` }
    }

    // Load metric types
    const { data: metricTypes, error: mtErr } = await supabase
      .from('metric_types')
      .select('*')

    if (mtErr || !metricTypes) {
      return { recommendations: [], error: `Failed to load metric types: ${mtErr?.message}` }
    }

    // Load latest summaries
    const { data: summaries } = await supabase
      .from('daily_summaries')
      .select('*')
      .in('member_id', members.map((m: { id: string }) => m.id))
      .order('summary_date', { ascending: false })
      .limit(members.length * 7)

    // Load recent observations (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .substring(0, 10)

    const { data: observations } = await supabase
      .from('metric_observations')
      .select('*, metric_type:metric_types(*)')
      .in('member_id', members.map((m: { id: string }) => m.id))
      .gte('observed_date', sevenDaysAgo)

    // Build observation map
    const observationsByMember: Record<string, typeof observations> = {}
    for (const obs of observations ?? []) {
      if (!observationsByMember[obs.member_id]) {
        observationsByMember[obs.member_id] = []
      }
      observationsByMember[obs.member_id].push(obs)
    }

    // Run detection
    const { runDetection } = await import('@/lib/rules/detection')
    const detectionResult = runDetection(
      members,
      observationsByMember as Record<string, ReturnType<typeof Array.prototype.filter>>,
      metricTypes,
      summaries ?? []
    )

    // Build member name + relationship maps
    const memberIdToName: Record<string, string> = {}
    const memberRelationships: Record<string, string | null> = {}
    for (const member of members as Array<{ id: string; member_name: string; relationship: string | null }>) {
      memberIdToName[member.id] = member.member_name
      memberRelationships[member.id] = member.relationship
    }

    // Generate recommendations with full observation context
    const recommendations = await generateRecommendations(
      familyId,
      detectionResult,
      memberIdToName,
      supabase,
      observationsByMember as Record<string, Array<{
        metric_type_id: string
        observed_date: string
        value: number | null
        metric_type?: { key: string; label: string; unit: string | null; normal_range_min: number | null; normal_range_max: number | null }
      }>>,
      memberRelationships
    )

    return { recommendations, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { recommendations: [], error: message }
  }
}
