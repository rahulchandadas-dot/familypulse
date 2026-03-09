/**
 * POST /api/chat
 *
 * Handles family health Q&A via Claude claude-sonnet-4-6.
 * Builds family health context, retrieves relevant sources,
 * calls Claude with grounding, and persists the conversation.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/server'
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
  ApiResponse,
  ChatMessage,
  DailySummary,
  FamilyMember,
  Recommendation,
} from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ChatRequestBody {
  sessionId?: string
  message: string
  familyId: string
}

// ============================================================
// CONTEXT BUILDING
// ============================================================

/**
 * Builds a structured family health context string for the LLM prompt.
 * Includes member summaries, active recommendations, and flags.
 */
async function buildFamilyContext(familyId: string): Promise<string> {
  const lines: string[] = []

  // Fetch family info
  const { data: family } = await supabaseAdmin
    .from('families')
    .select('name')
    .eq('id', familyId)
    .maybeSingle()

  lines.push(`FAMILY: ${family?.name ?? 'Unknown Family'}`)
  lines.push('')

  // Fetch members with latest summaries
  const { data: members } = await supabaseAdmin
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)

  if (!members || members.length === 0) {
    lines.push('No family members found.')
    return lines.join('\n')
  }

  const memberIds = (members as FamilyMember[]).map(m => m.id)

  // Fetch latest summaries
  const { data: summaries } = await supabaseAdmin
    .from('daily_summaries')
    .select('*')
    .in('member_id', memberIds)
    .order('summary_date', { ascending: false })
    .limit(memberIds.length)

  const latestByMember: Record<string, DailySummary> = {}
  for (const s of (summaries ?? []) as DailySummary[]) {
    if (!latestByMember[s.member_id]) {
      latestByMember[s.member_id] = s
    }
  }

  lines.push('FAMILY MEMBERS AND CURRENT HEALTH STATUS:')
  for (const member of members as FamilyMember[]) {
    const summary = latestByMember[member.id]
    lines.push(`\n• ${member.member_name} (${member.relationship ?? 'family member'})`)
    if (summary) {
      lines.push(`  Date: ${summary.summary_date}`)
      if (summary.overall_score !== null) {
        lines.push(`  Overall Score: ${Math.round(summary.overall_score)}/100`)
      }
      if (summary.readiness_score !== null) {
        lines.push(`  Readiness: ${Math.round(summary.readiness_score)}/100`)
      }
      if (summary.sleep_score !== null) {
        lines.push(`  Sleep: ${Math.round(summary.sleep_score)}/100`)
      }
      if (summary.activity_score !== null) {
        lines.push(`  Activity: ${Math.round(summary.activity_score)}/100`)
      }
      if (summary.stress_score !== null) {
        lines.push(`  Stress Level: ${Math.round(summary.stress_score)}/100`)
      }
      if (summary.flags && Array.isArray(summary.flags) && summary.flags.length > 0) {
        const flagList = (summary.flags as Array<{ severity: string; message: string }>)
          .map(f => `${f.severity.toUpperCase()}: ${f.message}`)
          .join('; ')
        lines.push(`  Active Flags: ${flagList}`)
      }
    } else {
      lines.push('  No recent health data available.')
    }
  }

  // Fetch active recommendations
  const { data: recs } = await supabaseAdmin
    .from('recommendations')
    .select('title, explanation, action_type, priority')
    .eq('family_id', familyId)
    .eq('is_active', true)
    .order('priority')
    .limit(5)

  if (recs && recs.length > 0) {
    lines.push('\nCURRENT ACTIVE RECOMMENDATIONS:')
    for (const rec of recs as Partial<Recommendation>[]) {
      const priorityLabel = rec.priority === 1 ? 'HIGH' : rec.priority === 2 ? 'MEDIUM' : 'LOW'
      lines.push(`• [${priorityLabel}] ${rec.title}: ${rec.explanation?.substring(0, 150)}...`)
    }
  }

  return lines.join('\n')
}

/**
 * Extracts health topic keywords from a user message for source retrieval.
 */
function extractTopicsFromMessage(message: string): string[] {
  const topicKeywords: Record<string, string[]> = {
    sleep: ['sleep', 'insomnia', 'tired', 'rest', 'fatigue', 'sleepy', 'bedtime'],
    stress: ['stress', 'anxiety', 'worried', 'overwhelmed', 'pressure', 'tense'],
    activity: ['exercise', 'walk', 'workout', 'steps', 'activity', 'move', 'sedentary'],
    hrv: ['hrv', 'heart rate variability', 'heart rate', 'heartrate'],
    nutrition: ['eat', 'food', 'diet', 'glucose', 'blood sugar', 'nutrition', 'meal'],
    recovery: ['recovery', 'readiness', 'recover', 'rest'],
    heart: ['heart', 'cardiovascular', 'blood pressure', 'pulse'],
    blood_oxygen: ['oxygen', 'spo2', 'breathing'],
  }

  const messageLower = message.toLowerCase()
  const foundTopics: string[] = []

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => messageLower.includes(kw))) {
      foundTopics.push(topic)
    }
  }

  return foundTopics.length > 0 ? foundTopics : ['health', 'wellness']
}

// ============================================================
// CHAT HANDLER
// ============================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ChatRequestBody

  try {
    body = await request.json() as ChatRequestBody
  } catch {
    return NextResponse.json(
      { data: null, error: 'Invalid JSON in request body', success: false } satisfies ApiResponse<null>,
      { status: 400 }
    )
  }

  const { sessionId, message, familyId } = body

  if (!message?.trim()) {
    return NextResponse.json(
      { data: null, error: 'message is required', success: false } satisfies ApiResponse<null>,
      { status: 400 }
    )
  }

  if (!familyId) {
    return NextResponse.json(
      { data: null, error: 'familyId is required', success: false } satisfies ApiResponse<null>,
      { status: 400 }
    )
  }

  try {
    // Step 1: Resolve or create chat session
    let resolvedSessionId = sessionId
    if (!resolvedSessionId) {
      const { data: newSession, error: sessionErr } = await supabaseAdmin
        .from('chat_sessions')
        .insert({
          family_id: familyId,
          title: message.substring(0, 60),
        })
        .select('id')
        .single()

      if (sessionErr || !newSession) {
        throw new Error(`Failed to create session: ${sessionErr?.message}`)
      }
      resolvedSessionId = newSession.id
    }

    // Step 2: Save user message
    const { data: userMsg, error: userMsgErr } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        session_id: resolvedSessionId,
        role: 'user',
        content: message,
        citations: [],
      })
      .select('id')
      .single()

    if (userMsgErr || !userMsg) {
      throw new Error(`Failed to save user message: ${userMsgErr?.message}`)
    }

    // Step 3: Load recent conversation history (last 10 messages)
    const { data: history } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', resolvedSessionId)
      .order('created_at', { ascending: true })
      .limit(10)

    // Step 4: Build family health context
    const familyContext = await buildFamilyContext(familyId)

    // Step 5: Retrieve relevant sources
    const topics = extractTopicsFromMessage(message)
    const sources = await retrieveRelevantSources(message, topics, supabaseAdmin)
    const sourcesPrompt = formatSourcesForPrompt(sources)

    // Step 6: Build system prompt
    const systemPrompt = `You are FamilyPulse AI, a family health advisor assistant. You help families understand their health data, identify patterns, and take practical steps to improve their collective wellbeing.

${GROUNDING_SYSTEM_PROMPT}

FAMILY HEALTH CONTEXT (use this to personalize your answers):
${familyContext}

${sourcesPrompt}

IMPORTANT: When referencing the family's data, use their actual names and scores from the context above. Be warm, specific, and actionable. Always end with the educational disclaimer.`

    // Step 7: Build messages array for API call
    const conversationMessages: Anthropic.MessageParam[] = (history ?? [])
      .filter((h: { role: string; content: string }) => h.role !== 'system')
      .map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      }))

    // Ensure last message is user message (it should be, we just saved it)
    // Remove it from history since we'll add it fresh
    const filteredHistory = conversationMessages.filter(
      (_, idx) => idx < conversationMessages.length - 1
    )
    filteredHistory.push({ role: 'user', content: message })

    // Step 8: Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: filteredHistory,
    })

    const assistantContent = response.content[0]
    if (assistantContent.type !== 'text') {
      throw new Error('Unexpected response type from Claude')
    }

    let assistantText = assistantContent.text.trim()

    // Ensure disclaimer is present
    if (!assistantText.includes('educational purposes only')) {
      assistantText += `\n\n_${DISCLAIMER_TEXT}_`
    }

    // Step 9: Extract and validate citations
    const rawCitations = extractCitationsFromText(assistantText)
    const validCitations = validateCitations(rawCitations, APPROVED_SOURCES)

    // Step 10: Save assistant message
    const { data: assistantMsg, error: asstErr } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        session_id: resolvedSessionId,
        role: 'assistant',
        content: assistantText,
        citations: validCitations,
      })
      .select('id, created_at')
      .single()

    if (asstErr) {
      console.error('Failed to save assistant message:', asstErr)
    }

    // Step 11: Save source citations to DB
    if (validCitations.length > 0 && assistantMsg) {
      for (const citation of validCitations) {
        const { data: existingDoc } = await supabaseAdmin
          .from('source_documents')
          .select('id')
          .eq('url', citation.url ?? '')
          .maybeSingle()

        let sourceDocId = existingDoc?.id

        if (!sourceDocId && citation.url) {
          const { data: newDoc } = await supabaseAdmin
            .from('source_documents')
            .insert({
              title: citation.title,
              source_org: citation.source_org,
              url: citation.url,
              content_summary: citation.excerpt,
              topic_tags: topics,
              is_approved: true,
            })
            .select('id')
            .single()
          sourceDocId = newDoc?.id
        }

        if (sourceDocId) {
          await supabaseAdmin.from('source_citations').insert({
            source_document_id: sourceDocId,
            chat_message_id: assistantMsg.id,
            excerpt: citation.excerpt,
            relevance_score: 0.9,
          })
        }
      }
    }

    const responseData: {
      sessionId: string
      message: ChatMessage
      citations: typeof validCitations
    } = {
      sessionId: resolvedSessionId,
      message: {
        id: assistantMsg?.id ?? '',
        session_id: resolvedSessionId,
        role: 'assistant',
        content: assistantText,
        citations: validCitations,
        created_at: assistantMsg?.created_at ?? new Date().toISOString(),
      },
      citations: validCitations,
    }

    return NextResponse.json(
      { data: responseData, error: null, success: true },
      { status: 200 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/chat] Error:', err)
    return NextResponse.json(
      { data: null, error: message, success: false } satisfies ApiResponse<null>,
      { status: 500 }
    )
  }
}

// GET /api/chat?session_id=... — fetch messages for a session
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('session_id')
  const familyId = searchParams.get('family_id')

  if (sessionId) {
    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message, success: false } satisfies ApiResponse<null>,
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { messages: data ?? [] }, error: null, success: true })
  }

  if (familyId) {
    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('family_id', familyId)
      .order('updated_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json(
        { data: null, error: error.message, success: false } satisfies ApiResponse<null>,
        { status: 500 }
      )
    }

    return NextResponse.json({ data: { sessions: data ?? [] }, error: null, success: true })
  }

  return NextResponse.json(
    { data: null, error: 'Either session_id or family_id is required', success: false } satisfies ApiResponse<null>,
    { status: 400 }
  )
}
