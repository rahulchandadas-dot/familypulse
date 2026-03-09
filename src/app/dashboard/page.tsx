/**
 * Dashboard Page (Server Component)
 *
 * Fetches all required family health data server-side and passes it to
 * the DashboardView client component for rendering.
 */

import { Suspense } from 'react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { runDetection } from '@/lib/rules/detection'
import DashboardView from '@/components/dashboard/DashboardView'
import type {
  DashboardData,
  Family,
  FamilyMember,
  MetricObservation,
  DailySummary,
  Recommendation,
  MetricType,
} from '@/types'

// ============================================================
// LOADING SKELETON
// ============================================================

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950 p-6">
      {/* Header skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="h-8 w-48 shimmer rounded-lg" />
        <div className="flex gap-3">
          <div className="h-8 w-24 shimmer rounded-full" />
          <div className="h-8 w-24 shimmer rounded-full" />
        </div>
      </div>

      {/* Recommendations skeleton */}
      <div className="mb-6">
        <div className="h-4 w-40 shimmer rounded mb-4" />
        <div className="flex gap-4 overflow-hidden">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 w-72 flex-shrink-0 shimmer rounded-xl" />
          ))}
        </div>
      </div>

      {/* Health highlights skeleton */}
      <div className="mb-6">
        <div className="h-4 w-36 shimmer rounded mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 shimmer rounded-xl" />
          ))}
        </div>
      </div>

      {/* Metrics grid skeleton */}
      <div>
        <div className="h-4 w-32 shimmer rounded mb-4" />
        <div className="grid grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-24 shimmer rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// DATA FETCHING
// ============================================================

async function fetchDashboardData(): Promise<DashboardData> {
  const supabase = supabaseAdmin

  // Fetch family (use first available)
  const { data: families, error: familyErr } = await supabase
    .from('families')
    .select('*')
    .limit(1)
    .single()

  // If no family exists yet, return empty state
  if (familyErr || !families) {
    return {
      family: { id: '', name: 'My Family', created_at: '', updated_at: '' },
      members: [],
      active_recommendations: [],
      metric_types: [],
      detection_result: null,
      last_ingested_at: null,
      generated_at: new Date().toISOString(),
    }
  }

  const family = families as Family

  // Fetch all members with profiles
  const { data: membersData } = await supabase
    .from('family_members')
    .select('*, profile:member_profiles(*)')
    .eq('family_id', family.id)
    .order('member_name')

  const members = (membersData ?? []) as FamilyMember[]

  // Fetch metric types
  const { data: metricTypesData } = await supabase
    .from('metric_types')
    .select('*')
    .order('category, label')

  const metricTypes = (metricTypesData ?? []) as MetricType[]

  // Fetch active recommendations with citations
  const { data: recsData } = await supabase
    .from('recommendations')
    .select(`
      *,
      citations:source_citations(
        *,
        source_document:source_documents(*)
      )
    `)
    .eq('family_id', family.id)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .order('generated_at', { ascending: false })
    .limit(10)

  const activeRecommendations = (recsData ?? []) as Recommendation[]

  // Fetch recent metric observations (last 14 days) for all members
  const memberIds = members.map(m => m.id)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .substring(0, 10)

  const { data: obsData } = await supabase
    .from('metric_observations')
    .select('*, metric_type:metric_types(*)')
    .in('member_id', memberIds)
    .gte('observed_date', fourteenDaysAgo)
    .order('observed_date', { ascending: false })

  const allObservations = (obsData ?? []) as MetricObservation[]

  // Fetch latest daily summaries for each member
  const { data: summariesData } = await supabase
    .from('daily_summaries')
    .select('*')
    .in('member_id', memberIds)
    .order('summary_date', { ascending: false })
    .limit(memberIds.length * 7)  // up to 7 days per member

  const allSummaries = (summariesData ?? []) as DailySummary[]

  // Build per-member data structures
  const observationsByMember: Record<string, MetricObservation[]> = {}
  for (const obs of allObservations) {
    if (!observationsByMember[obs.member_id]) {
      observationsByMember[obs.member_id] = []
    }
    observationsByMember[obs.member_id].push(obs)
  }

  const latestSummaryByMember: Record<string, DailySummary> = {}
  for (const summary of allSummaries) {
    const existing = latestSummaryByMember[summary.member_id]
    if (!existing || summary.summary_date > existing.summary_date) {
      latestSummaryByMember[summary.member_id] = summary
    }
  }

  // Run detection engine
  const detectionResult = runDetection(
    members,
    observationsByMember,
    metricTypes,
    allSummaries
  )

  // Build member-with-data objects
  const flagsByMember: Record<string, typeof detectionResult.flags[0][]> = {}
  for (const flag of detectionResult.flags) {
    if (!flagsByMember[flag.member_id]) {
      flagsByMember[flag.member_id] = []
    }
    flagsByMember[flag.member_id].push(flag)
  }

  const membersWithData = members.map(member => ({
    member,
    latest_summary: latestSummaryByMember[member.id] ?? null,
    recent_observations: observationsByMember[member.id] ?? [],
    flags: flagsByMember[member.id] ?? [],
  }))

  // Determine last ingestion time
  const { data: lastIngestion } = await supabase
    .from('ingestion_logs')
    .select('completed_at')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    family,
    members: membersWithData,
    active_recommendations: activeRecommendations,
    metric_types: metricTypes,
    detection_result: detectionResult,
    last_ingested_at: lastIngestion?.completed_at ?? null,
    generated_at: new Date().toISOString(),
  }
}

// ============================================================
// PAGE COMPONENT
// ============================================================

async function DashboardContent() {
  const dashboardData = await fetchDashboardData()
  return <DashboardView data={dashboardData} />
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
