'use client'

/**
 * RecommendationCards
 * Horizontal scrolling row of premium recommendation cards.
 */

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, RefreshCw, ChevronRight, Zap, Moon, Heart, Brain, Users } from 'lucide-react'
import { cn, getPriorityColor, getEvidenceLevelColor, getMemberColor, getMemberInitials, truncate } from '@/lib/utils'
import type { Recommendation, FamilyMember, ActionType, FeedbackType } from '@/types'

interface RecommendationCardsProps {
  recommendations: Recommendation[]
  members: FamilyMember[]
  familyId: string
}

const ACTION_ICONS: Record<ActionType, React.FC<{ className?: string }>> = {
  activity: ({ className }) => <Zap className={className} />,
  sleep: ({ className }) => <Moon className={className} />,
  heart: ({ className }) => <Heart className={className} />,
  nutrition: ({ className }) => <Brain className={className} />,
  stress: ({ className }) => <Brain className={className} />,
  social: ({ className }) => <Users className={className} />,
}

const ACTION_COLORS: Record<ActionType, string> = {
  activity: 'text-emerald-400',
  sleep: 'text-violet-400',
  heart: 'text-red-400',
  nutrition: 'text-amber-400',
  stress: 'text-blue-400',
  social: 'text-pink-400',
}

// ============================================================
// SINGLE CARD
// ============================================================

interface RecommendationCardProps {
  recommendation: Recommendation
  members: FamilyMember[]
  onFeedback: (id: string, type: FeedbackType) => Promise<void>
}

function RecommendationCard({ recommendation, members, onFeedback }: RecommendationCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [feedbackState, setFeedbackState] = useState<FeedbackType | null>(null)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)

  const priorityColors = getPriorityColor(recommendation.priority)
  const evidenceColors = getEvidenceLevelColor(recommendation.evidence_level)
  const ActionIcon = recommendation.action_type
    ? ACTION_ICONS[recommendation.action_type as ActionType]
    : null
  const actionColor = recommendation.action_type
    ? ACTION_COLORS[recommendation.action_type as ActionType]
    : 'text-gray-400'

  // Find affected members
  const affectedMembers = members.filter(m =>
    recommendation.affected_member_ids?.includes(m.id)
  )

  const handleFeedback = async (type: FeedbackType) => {
    if (submittingFeedback || feedbackState) return
    setSubmittingFeedback(true)
    await onFeedback(recommendation.id, type)
    setFeedbackState(type)
    setSubmittingFeedback(false)
  }

  return (
    <div
      className={cn(
        'relative flex flex-col w-72 flex-shrink-0 rounded-xl bg-gray-900 border transition-all duration-200 overflow-hidden',
        priorityColors.border,
        recommendation.priority === 1 && 'shadow-glow-red',
        recommendation.priority === 2 && 'shadow-glow-amber',
        'hover:translate-y-[-2px] hover:shadow-card-hover cursor-pointer'
      )}
    >
      {/* Priority glow accent top bar */}
      <div
        className={cn(
          'h-0.5 w-full',
          recommendation.priority === 1 && 'bg-gradient-to-r from-red-600 via-red-500 to-transparent',
          recommendation.priority === 2 && 'bg-gradient-to-r from-amber-600 via-amber-500 to-transparent',
          recommendation.priority === 3 && 'bg-gradient-to-r from-slate-600 via-slate-500 to-transparent',
        )}
      />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Header: icon + priority badge */}
        <div className="flex items-start justify-between gap-2">
          <div className={cn('p-1.5 rounded-lg bg-gray-800/60', actionColor)}>
            {ActionIcon && <ActionIcon className="w-4 h-4" />}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                priorityColors.text,
                priorityColors.bg,
                priorityColors.border
              )}
            >
              {priorityColors.label}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-gray-100 leading-tight">
          {recommendation.title}
        </h3>

        {/* Explanation */}
        <p className="text-xs text-gray-400 leading-relaxed">
          {expanded
            ? recommendation.explanation
            : truncate(recommendation.explanation, 120)}
        </p>

        {recommendation.explanation.length > 120 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors self-start"
          >
            {expanded ? 'Show less' : 'Read more'}
            <ChevronRight className={cn('w-3 h-3 transition-transform', expanded && 'rotate-90')} />
          </button>
        )}

        {/* Affected members */}
        {affectedMembers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {affectedMembers.map(member => (
              <span
                key={member.id}
                className="member-pill"
                style={{
                  backgroundColor: getMemberColor(member.id) + '20',
                  borderColor: getMemberColor(member.id) + '40',
                  border: '1px solid',
                  color: getMemberColor(member.id),
                }}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: getMemberColor(member.id) }}
                >
                  {getMemberInitials(member.member_name)}
                </span>
                {member.member_name.split(' ')[0]}
              </span>
            ))}
          </div>
        )}

        {/* Evidence level */}
        <span
          className={cn(
            'self-start text-[10px] font-medium px-2 py-0.5 rounded-full',
            evidenceColors.bg,
            evidenceColors.text
          )}
        >
          {evidenceColors.label}
        </span>
      </div>

      {/* Footer: feedback buttons */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-800/60 pt-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleFeedback('helpful')}
            disabled={!!feedbackState}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all',
              feedbackState === 'helpful'
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            )}
            title="Helpful"
          >
            <ThumbsUp className="w-3 h-3" />
            {feedbackState === 'helpful' && <span>Helpful</span>}
          </button>
          <button
            onClick={() => handleFeedback('not_helpful')}
            disabled={!!feedbackState}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all',
              feedbackState === 'not_helpful'
                ? 'bg-red-600/20 text-red-400 border border-red-600/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            )}
            title="Not helpful"
          >
            <ThumbsDown className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleFeedback('already_doing')}
            disabled={!!feedbackState}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all',
              feedbackState === 'already_doing'
                ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
            )}
            title="Already doing this"
          >
            <span className="text-[10px]">✓ Doing</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div className="flex items-center gap-6 py-8 px-6 bg-gray-900/50 border border-gray-800/50 rounded-xl">
      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
        <Zap className="w-6 h-6 text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-300 mb-1">No recommendations yet</p>
        <p className="text-xs text-gray-500">
          Sync your health data to generate personalized family recommendations.
        </p>
      </div>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium hover:bg-indigo-600/30 transition-all flex-shrink-0 disabled:opacity-50"
      >
        <RefreshCw className={cn('w-4 h-4', generating && 'animate-spin')} />
        {generating ? 'Generating…' : 'Generate'}
      </button>
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function RecommendationCards({
  recommendations,
  members,
  familyId,
}: RecommendationCardsProps) {
  const [generating, setGenerating] = useState(false)
  const [localRecs, setLocalRecs] = useState(recommendations)

  const handleGenerateRecs = async () => {
    setGenerating(true)
    try {
      const response = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_id: familyId }),
      })
      const result = await response.json() as {
        success: boolean
        data?: { recommendations?: Recommendation[] }
      }
      if (result.success && result.data?.recommendations) {
        setLocalRecs(result.data.recommendations)
      }
    } catch (err) {
      console.error('Failed to generate recommendations:', err)
    } finally {
      setGenerating(false)
    }
  }

  const handleFeedback = async (id: string, type: FeedbackType) => {
    try {
      await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: id, feedback_type: type }),
      })
    } catch (err) {
      console.error('Failed to submit feedback:', err)
    }
  }

  if (localRecs.length === 0) {
    return <EmptyState onGenerate={handleGenerateRecs} generating={generating} />
  }

  return (
    <div className="relative">
      {/* Scroll container */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
        {localRecs.map(rec => (
          <div key={rec.id} className="snap-start">
            <RecommendationCard
              recommendation={rec}
              members={members}
              onFeedback={handleFeedback}
            />
          </div>
        ))}
        {/* Regenerate card */}
        <div className="flex-shrink-0 w-48 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-700/60 bg-gray-900/30 p-6 snap-start">
          <button
            onClick={handleGenerateRecs}
            disabled={generating}
            className="flex flex-col items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors group"
          >
            <RefreshCw className={cn(
              'w-6 h-6 group-hover:text-indigo-400 transition-colors',
              generating && 'animate-spin'
            )} />
            <span className="text-xs text-center">
              {generating ? 'Generating new recommendations…' : 'Refresh recommendations'}
            </span>
          </button>
        </div>
      </div>

      {/* Fade-out edge indicator */}
      <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-gray-950 to-transparent pointer-events-none" />
    </div>
  )
}
