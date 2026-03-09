/**
 * GET /api/metrics
 *
 * Returns metric observations with optional filters:
 * - member_id: filter by member UUID
 * - date_from: ISO date lower bound
 * - date_to: ISO date upper bound
 * - metric_keys: comma-separated list of metric keys (e.g. 'steps,sleep_hours')
 * - limit: max records (default 200, max 1000)
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { ApiResponse, MetricObservation, MetricsFilterParams } from '@/types'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  const params: MetricsFilterParams = {
    member_id: searchParams.get('member_id') ?? undefined,
    date_from: searchParams.get('date_from') ?? undefined,
    date_to: searchParams.get('date_to') ?? undefined,
    metric_keys: searchParams.get('metric_keys')?.split(',').filter(Boolean) ?? undefined,
  }

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 1000)
  const familyId = searchParams.get('family_id')

  try {
    let query = supabaseAdmin
      .from('metric_observations')
      .select(`
        *,
        metric_type:metric_types(*)
      `)
      .order('observed_date', { ascending: false })
      .limit(limit)

    // Filter by family (via family_members join)
    if (familyId && !params.member_id) {
      const { data: members } = await supabaseAdmin
        .from('family_members')
        .select('id')
        .eq('family_id', familyId)

      if (members && members.length > 0) {
        query = query.in('member_id', members.map((m: { id: string }) => m.id))
      }
    }

    // Filter by member
    if (params.member_id) {
      query = query.eq('member_id', params.member_id)
    }

    // Date range filters
    if (params.date_from) {
      query = query.gte('observed_date', params.date_from)
    }
    if (params.date_to) {
      query = query.lte('observed_date', params.date_to)
    }

    // Metric key filter (requires joining metric_types)
    if (params.metric_keys && params.metric_keys.length > 0) {
      const { data: matchingTypes } = await supabaseAdmin
        .from('metric_types')
        .select('id')
        .in('key', params.metric_keys)

      if (matchingTypes && matchingTypes.length > 0) {
        query = query.in('metric_type_id', matchingTypes.map((t: { id: string }) => t.id))
      }
    }

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message, success: false } satisfies ApiResponse<null>,
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        data: {
          observations: (data ?? []) as MetricObservation[],
          count: data?.length ?? 0,
          filters: params,
        },
        error: null,
        success: true,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { data: null, error: message, success: false } satisfies ApiResponse<null>,
      { status: 500 }
    )
  }
}
