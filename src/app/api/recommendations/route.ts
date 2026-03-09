/**
 * /api/recommendations
 *
 * GET  - Returns active recommendations for a family with citation data
 * POST - Triggers full recommendation generation pipeline for a family
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { runRecommendationPipeline } from '@/lib/recommendations/engine'
import type { ApiResponse, Recommendation } from '@/types'

// ============================================================
// GET /api/recommendations
// ============================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const familyId = searchParams.get('family_id')
  const includeInactive = searchParams.get('include_inactive') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 50)

  if (!familyId) {
    return NextResponse.json(
      { data: null, error: 'family_id query parameter is required', success: false } satisfies ApiResponse<null>,
      { status: 400 }
    )
  }

  try {
    let query = supabaseAdmin
      .from('recommendations')
      .select(`
        *,
        citations:source_citations(
          *,
          source_document:source_documents(*)
        )
      `)
      .eq('family_id', familyId)
      .order('priority', { ascending: true })
      .order('generated_at', { ascending: false })
      .limit(limit)

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message, success: false } satisfies ApiResponse<null>,
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        data: {
          recommendations: (data ?? []) as Recommendation[],
          count: data?.length ?? 0,
        },
        error: null,
        success: true,
      },
      { status: 200 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { data: null, error: message, success: false } satisfies ApiResponse<null>,
      { status: 500 }
    )
  }
}

// ============================================================
// POST /api/recommendations (generate)
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { family_id?: string }
    const familyId = body.family_id

    if (!familyId) {
      return NextResponse.json(
        { data: null, error: 'family_id is required in request body', success: false } satisfies ApiResponse<null>,
        { status: 400 }
      )
    }

    // Verify family exists
    const { data: family, error: familyErr } = await supabaseAdmin
      .from('families')
      .select('id, name')
      .eq('id', familyId)
      .maybeSingle()

    if (familyErr || !family) {
      return NextResponse.json(
        { data: null, error: `Family not found: ${familyId}`, success: false } satisfies ApiResponse<null>,
        { status: 404 }
      )
    }

    // Run recommendation pipeline
    const { recommendations, error } = await runRecommendationPipeline(
      familyId,
      supabaseAdmin
    )

    if (error) {
      return NextResponse.json(
        { data: null, error, success: false } satisfies ApiResponse<null>,
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        data: {
          recommendations,
          count: recommendations.length,
          generatedAt: new Date().toISOString(),
        },
        error: null,
        success: true,
      },
      { status: 200 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { data: null, error: message, success: false } satisfies ApiResponse<null>,
      { status: 500 }
    )
  }
}
