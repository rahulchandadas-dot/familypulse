/**
 * Medical Grounding Layer
 *
 * Provides source retrieval, citation validation, and grounding prompts
 * to ensure all LLM-generated health content is backed by approved sources.
 *
 * GROUNDING POLICY:
 * - Only sources from APPROVED_SOURCES (whitelist) may be cited
 * - All citations are validated before display
 * - LLM is instructed to only reference approved sources via GROUNDING_SYSTEM_PROMPT
 * - Unapproved citations are stripped from responses silently
 * - A disclaimer is always shown to users
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  APPROVED_SOURCES,
  getSourcesByTopic,
  getSourcesForTopics,
  isApprovedSource,
  type ApprovedSource,
} from './sources'
import type { SourceDocument, Citation } from '@/types'

// ============================================================
// GROUNDING SYSTEM PROMPT FRAGMENT
// ============================================================

/**
 * System prompt fragment injected into all LLM calls.
 * Instructs Claude to cite only approved sources and use appropriate disclaimers.
 */
export const GROUNDING_SYSTEM_PROMPT = `
CITATION AND GROUNDING RULES (MANDATORY):

1. APPROVED SOURCES ONLY: You may ONLY cite information from the following approved organizations:
   CDC (cdc.gov), NIH (nih.gov, nimh.nih.gov, nhlbi.nih.gov), MedlinePlus (medlineplus.gov),
   NHS UK (nhs.uk), WHO (who.int), American Heart Association (heart.org),
   American Academy of Sleep Medicine (aasm.org), Harvard Health (health.harvard.edu),
   Cleveland Clinic (clevelandclinic.org), Mayo Clinic (mayoclinic.org).

2. NO DIAGNOSIS: Never suggest a medical diagnosis. Do not use language like "you may have",
   "this could indicate [disease]", or similar diagnostic phrasing.

3. NO PRESCRIPTIVE MEDICAL ADVICE: Do not recommend specific medications, supplements, or
   medical procedures. Do not suggest adjusting existing prescriptions.

4. EDUCATIONAL FRAMING: Frame all information as educational. Use phrases like:
   "According to [source]...", "Research suggests...", "Health guidelines recommend..."

5. CITE INLINE: When referencing specific facts or statistics, cite the source inline using
   the format: [Source Name](URL)

6. EVIDENCE HIERARCHY: Prefer citing strong evidence (RCTs, systematic reviews from major
   health organizations) over anecdotal or preliminary research.

7. INSUFFICIENT EVIDENCE: If there is not enough evidence to give specific guidance,
   acknowledge this and suggest consulting a healthcare provider.

8. FAMILY CONTEXT: When making recommendations, consider all affected family members and
   suggest coordinated, family-friendly approaches where appropriate.

9. DISCLAIMER: Always end responses with: "This information is for educational purposes only
   and is not a substitute for professional medical advice, diagnosis, or treatment."
`.trim()

// ============================================================
// DISCLAIMER TEXT
// ============================================================

/**
 * Standard educational disclaimer shown to users alongside AI-generated content.
 */
export const DISCLAIMER_TEXT =
  'This information is for educational purposes only and is not a substitute for ' +
  'professional medical advice, diagnosis, or treatment. Always consult a qualified ' +
  'healthcare provider with any questions you may have regarding your health or your ' +
  "family's health."

/**
 * Short version of the disclaimer for compact UI displays.
 */
export const SHORT_DISCLAIMER =
  'Educational only. Not a substitute for medical care. Consult a healthcare provider.'

// ============================================================
// SOURCE RETRIEVAL
// ============================================================

/**
 * Retrieves relevant SourceDocument records from the database for a given topic
 * and set of metric keys. Falls back to the in-memory APPROVED_SOURCES registry
 * if the database query returns insufficient results.
 *
 * @param topic - Freeform topic string (e.g., "sleep quality", "stress management")
 * @param metricKeys - Array of metric key strings (e.g., ['sleep_hours', 'hrv'])
 * @param supabase - Optional Supabase client for DB lookup
 * @returns Array of SourceDocument objects
 */
export async function retrieveRelevantSources(
  topic: string,
  metricKeys: string[],
  supabase?: SupabaseClient
): Promise<SourceDocument[]> {
  const dbSources: SourceDocument[] = []

  // Try to get sources from the database first
  if (supabase) {
    try {
      const allTopics = [topic, ...metricKeys]
        .map(t => t.toLowerCase().replace(/[\s-]/g, '_'))
        .filter(Boolean)

      const { data, error } = await supabase
        .from('source_documents')
        .select('*')
        .eq('is_approved', true)
        .contains('topic_tags', allTopics)
        .limit(10)

      if (!error && data && data.length >= 3) {
        return data as SourceDocument[]
      }

      // Partial match: look for any overlap
      if (!error && data) {
        dbSources.push(...(data as SourceDocument[]))
      }
    } catch {
      // Silently fall back to registry
    }
  }

  // Fall back to in-memory registry
  const registrySources = getSourcesForTopics([topic, ...metricKeys])
  const registryAsDocs: SourceDocument[] = registrySources.map(s => ({
    id: s.id,
    title: s.name,
    source_org: s.organization,
    url: s.url,
    content_summary: s.description,
    topic_tags: s.topics,
    is_approved: true,
    created_at: new Date().toISOString(),
  }))

  // Merge DB results with registry, deduplicating by ID
  const merged = [...dbSources]
  const existingIds = new Set(dbSources.map(s => s.id))
  for (const doc of registryAsDocs) {
    if (!existingIds.has(doc.id)) {
      merged.push(doc)
    }
  }

  return merged.slice(0, 8)  // cap at 8 sources for prompt length
}

// ============================================================
// PROMPT FORMATTING
// ============================================================

/**
 * Formats an array of SourceDocument records into a structured string
 * suitable for injection into an LLM prompt as reference context.
 *
 * @param sources - Array of SourceDocument objects
 * @returns Formatted string ready for inclusion in a system or user prompt
 */
export function formatSourcesForPrompt(sources: SourceDocument[]): string {
  if (sources.length === 0) {
    return 'No specific sources available. Use general knowledge from approved health organizations (CDC, NIH, WHO) and cite them by name.'
  }

  const lines: string[] = [
    'APPROVED REFERENCE SOURCES (use these to ground your response):',
    '',
  ]

  sources.forEach((source, idx) => {
    lines.push(`[${idx + 1}] ${source.source_org} — ${source.title}`)
    if (source.url) {
      lines.push(`    URL: ${source.url}`)
    }
    if (source.content_summary) {
      lines.push(`    Summary: ${source.content_summary}`)
    }
    if (source.topic_tags && source.topic_tags.length > 0) {
      lines.push(`    Topics: ${source.topic_tags.join(', ')}`)
    }
    lines.push('')
  })

  lines.push(
    'When citing these sources in your response, use the format: [Organization: Title](URL)',
    'Only cite sources from this list or other approved health organizations listed in your system instructions.'
  )

  return lines.join('\n')
}

// ============================================================
// CITATION VALIDATION
// ============================================================

/**
 * Validates an array of citations against the approved sources whitelist.
 * Strips any citations from unapproved domains or unknown organizations.
 *
 * @param citations - Citations to validate (from LLM response or DB)
 * @param approvedSources - Approved sources to validate against
 * @returns Filtered array containing only valid, approved citations
 */
export function validateCitations(
  citations: Citation[],
  approvedSources: ApprovedSource[] = APPROVED_SOURCES
): Citation[] {
  const approvedOrgNames = new Set(
    approvedSources.map(s => s.organization.toLowerCase())
  )

  return citations.filter(citation => {
    // Check URL domain if available
    if (citation.url) {
      if (isApprovedSource(citation.url)) return true
    }

    // Check organization name
    if (citation.source_org) {
      if (approvedOrgNames.has(citation.source_org.toLowerCase())) return true
    }

    // Check if source_org is a substring match of any approved org
    if (citation.source_org) {
      const orgLower = citation.source_org.toLowerCase()
      for (const approvedOrg of approvedOrgNames) {
        if (orgLower.includes(approvedOrg) || approvedOrg.includes(orgLower)) {
          return true
        }
      }
    }

    return false
  })
}

/**
 * Parses inline citations from LLM-generated markdown text.
 * Extracts [Title](URL) patterns and validates them.
 *
 * @param text - Markdown text from LLM response
 * @returns Array of parsed and validated Citation objects
 */
export function extractCitationsFromText(text: string): Citation[] {
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
  const citations: Citation[] = []
  let match: RegExpExecArray | null

  while ((match = linkRegex.exec(text)) !== null) {
    const [, title, url] = match

    // Determine organization from URL
    let sourceOrg = 'Unknown'
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '')
      const source = APPROVED_SOURCES.find(s => {
        try {
          return new URL(s.url).hostname.replace(/^www\./, '') === hostname
        } catch {
          return false
        }
      })
      if (source) {
        sourceOrg = source.organization
      } else {
        // Try to infer from common domains
        if (hostname.includes('cdc.gov')) sourceOrg = 'CDC'
        else if (hostname.includes('nih.gov')) sourceOrg = 'NIH'
        else if (hostname.includes('nhs.uk')) sourceOrg = 'NHS'
        else if (hostname.includes('who.int')) sourceOrg = 'WHO'
        else if (hostname.includes('medlineplus.gov')) sourceOrg = 'MedlinePlus'
        else if (hostname.includes('heart.org')) sourceOrg = 'American Heart Association'
        else if (hostname.includes('harvard.edu')) sourceOrg = 'Harvard Health'
        else if (hostname.includes('clevelandclinic.org')) sourceOrg = 'Cleveland Clinic'
        else if (hostname.includes('mayoclinic.org')) sourceOrg = 'Mayo Clinic'
      }
    } catch {
      // Malformed URL
    }

    citations.push({
      title,
      source_org: sourceOrg,
      url,
      excerpt: null,
    })
  }

  return validateCitations(citations)
}

/**
 * Builds a compact citation context block for family health LLM prompts.
 * Includes relevant sources and grounding instructions.
 *
 * @param topic - The health topic being addressed
 * @param metricKeys - Relevant metric keys
 * @param supabase - Optional Supabase client
 * @returns Object with prompt fragment and source list
 */
export async function buildGroundingContext(
  topic: string,
  metricKeys: string[],
  supabase?: SupabaseClient
): Promise<{ promptFragment: string; sources: SourceDocument[] }> {
  const sources = await retrieveRelevantSources(topic, metricKeys, supabase)
  const promptFragment = formatSourcesForPrompt(sources)
  return { promptFragment, sources }
}

/**
 * Returns approved sources as Citation objects for a given topic.
 * Used to pre-populate citations for deterministic recommendations.
 *
 * @param topics - Topics to find sources for
 */
export function getTopicCitations(topics: string[]): Citation[] {
  const sources = getSourcesForTopics(topics)
  return sources.slice(0, 3).map(s => ({
    title: s.name,
    source_org: s.organization,
    url: s.url,
    excerpt: s.description,
  }))
}
