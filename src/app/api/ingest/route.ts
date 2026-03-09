/**
 * POST /api/ingest
 *
 * Reads the Excel file at EXCEL_FILE_PATH, runs the full ingestion pipeline,
 * then triggers recommendation regeneration for all families.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { runIngestionPipeline } from '@/lib/ingestion/excel-parser'
import { DEFAULT_INGESTION_CONFIG } from '@/lib/ingestion/column-mapping'
import { runRecommendationPipeline } from '@/lib/recommendations/engine'
import type { ApiResponse, IngestionResult } from '@/types'

export async function POST(): Promise<NextResponse> {
  const filePath = process.env.EXCEL_FILE_PATH

  if (!filePath) {
    return NextResponse.json(
      {
        data: null,
        error: 'EXCEL_FILE_PATH environment variable is not set.',
        success: false,
      } satisfies ApiResponse<null>,
      { status: 400 }
    )
  }

  try {
    // Step 1: Run ingestion pipeline
    const ingestionResult = await runIngestionPipeline(
      filePath,
      DEFAULT_INGESTION_CONFIG,
      supabaseAdmin
    )

    // Step 2: Trigger recommendation regeneration for all families
    const { data: families } = await supabaseAdmin
      .from('families')
      .select('id, name')

    const recommendationResults: Array<{
      familyId: string
      familyName: string
      count: number
      error: string | null
    }> = []

    if (families && ingestionResult.status !== 'error') {
      for (const family of families as Array<{ id: string; name: string }>) {
        const { recommendations, error } = await runRecommendationPipeline(
          family.id,
          supabaseAdmin
        )
        recommendationResults.push({
          familyId: family.id,
          familyName: family.name,
          count: recommendations.length,
          error,
        })
      }
    }

    const response = {
      ingestion: {
        logId: ingestionResult.logId,
        status: ingestionResult.status,
        rowsProcessed: ingestionResult.rowsProcessed,
        rowsInserted: ingestionResult.rowsInserted,
        rowsUpdated: ingestionResult.rowsUpdated,
        skippedRows: ingestionResult.skippedRows,
        errorCount: ingestionResult.errors.length,
        errors: ingestionResult.errors.slice(0, 10),  // cap errors in response
        validationWarnings: ingestionResult.validationWarnings?.slice(0, 10) ?? [],
      },
      recommendations: recommendationResults,
      generatedAt: new Date().toISOString(),
    }

    const statusCode = ingestionResult.status === 'error' ? 422 : 200

    return NextResponse.json(
      { data: response, error: null, success: ingestionResult.status !== 'error' } satisfies ApiResponse<typeof response>,
      { status: statusCode }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown ingestion error'
    console.error('[/api/ingest] Fatal error:', err)

    return NextResponse.json(
      { data: null, error: message, success: false } satisfies ApiResponse<null>,
      { status: 500 }
    )
  }
}

// Allow GET to check ingestion status
export async function GET(): Promise<NextResponse> {
  try {
    const { data: logs, error } = await supabaseAdmin
      .from('ingestion_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10)

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message, success: false } satisfies ApiResponse<null>,
        { status: 500 }
      )
    }

    return NextResponse.json(
      { data: { logs: logs ?? [] }, error: null, success: true },
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
