'use client'

/**
 * HealthHighlights
 * Grid of compact cards showing flagged/notable health metrics.
 * Clicking a card opens the MetricDetailModal.
 */

import { useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn, getSeverityColor, getMemberColor, getMemberInitials, formatMetricValue } from '@/lib/utils'
import MetricDetailModal from './MetricDetailModal'
import type { DetectionFlag, FamilyMember, MemberWithData, MetricType } from '@/types'

interface HealthHighlightsProps {
  flags: DetectionFlag[]
  members: FamilyMember[]
  membersWithData: MemberWithData[]
  metricTypes: MetricType[]
}

// ============================================================
// HIGHLIGHT CARD
// ============================================================

interface HighlightCardProps {
  flag: DetectionFlag
  member: FamilyMember
  metricType: MetricType | undefined
  trendData: number[]
  onClick: () => void
}

function HighlightCard({ flag, member, metricType, trendData, onClick }: HighlightCardProps) {
  const severityColors = getSeverityColor(flag.severity)
  const memberColor = getMemberColor(member.id)

  const TrendIcon =
    flag.trend === 'improving'
      ? TrendingUp
      : flag.trend === 'declining'
      ? TrendingDown
      : Minus

  const trendColorClass =
    flag.trend === 'improving'
      ? (metricType?.higher_is_better ? 'text-emerald-400' : 'text-red-400')
      : flag.trend === 'declining'
      ? (metricType?.higher_is_better ? 'text-red-400' : 'text-emerald-400')
      : 'text-gray-500'

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex flex-col gap-2.5 p-3.5 rounded-xl text-left w-full',
        'bg-gray-900 border transition-all duration-150',
        'hover:translate-y-[-2px] hover:shadow-card-hover',
        severityColors.border,
        flag.severity === 'critical' && 'shadow-glow-red'
      )}
    >
      {/* Severity dot */}
      <span
        className={cn('absolute top-3 right-3 w-2 h-2 rounded-full status-dot', severityColors.dot)}
      />

      {/* Member pill */}
      <div
        className="member-pill self-start"
        style={{
          backgroundColor: memberColor + '20',
          border: `1px solid ${memberColor}40`,
          color: memberColor,
        }}
      >
        <span
          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: memberColor }}
        >
          {getMemberInitials(member.member_name)}
        </span>
        <span>{member.member_name.split(' ')[0]}</span>
      </div>

      {/* Metric name */}
      <p className="text-xs text-gray-400 leading-tight">{flag.metric_label}</p>

      {/* Value + trend */}
      <div className="flex items-end justify-between gap-2">
        <span className="text-xl font-bold tabular-nums text-gray-50">
          {formatMetricValue(flag.current_value, null)}
          {metricType?.unit && (
            <span className="text-xs font-normal text-gray-500 ml-1">
              {metricType.unit}
            </span>
          )}
        </span>
        <TrendIcon className={cn('w-4 h-4 flex-shrink-0 mb-0.5', trendColorClass)} />
      </div>

      {/* Severity label */}
      <span
        className={cn(
          'text-[10px] font-medium px-2 py-0.5 rounded-full self-start',
          severityColors.bg,
          severityColors.text
        )}
      >
        {severityColors.label}
      </span>

      {/* Mini sparkline */}
      {trendData.length > 1 && (
        <MiniSparkline data={trendData} higherIsBetter={metricType?.higher_is_better ?? true} />
      )}
    </button>
  )
}

// ============================================================
// MINI SPARKLINE (pure SVG)
// ============================================================

function MiniSparkline({
  data,
  higherIsBetter,
}: {
  data: number[]
  higherIsBetter: boolean
}) {
  if (data.length < 2) return null

  const width = 200
  const height = 28
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })

  const lastVal = data[data.length - 1]
  const firstVal = data[0]
  const improving = higherIsBetter ? lastVal >= firstVal : lastVal <= firstVal

  const strokeColor = improving ? '#10b981' : '#ef4444'

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible"
    >
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* End dot */}
      <circle
        cx={(data.length - 1) / (data.length - 1) * width}
        cy={height - ((lastVal - min) / range) * height}
        r="2.5"
        fill={strokeColor}
      />
    </svg>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function HealthHighlights({
  flags,
  members,
  membersWithData,
  metricTypes,
}: HealthHighlightsProps) {
  const [selectedFlag, setSelectedFlag] = useState<DetectionFlag | null>(null)
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null)

  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-4 py-6 px-5 bg-emerald-950/20 border border-emerald-800/30 rounded-xl">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
          <span className="text-emerald-400 text-lg">✓</span>
        </div>
        <div>
          <p className="text-sm font-medium text-emerald-300">All metrics within normal ranges</p>
          <p className="text-xs text-gray-500 mt-0.5">
            No flagged metrics for any family member. Great work!
          </p>
        </div>
      </div>
    )
  }

  // Build member and metric type lookups
  const memberById: Record<string, FamilyMember> = {}
  for (const m of members) {
    memberById[m.id] = m
  }

  const metricTypeByKey: Record<string, MetricType> = {}
  for (const mt of metricTypes) {
    metricTypeByKey[mt.key] = mt
  }

  // Build trend data lookup: member_id + metric_key -> number[]
  const trendDataMap: Record<string, number[]> = {}
  for (const mwd of membersWithData) {
    for (const obs of mwd.recent_observations) {
      const mt = metricTypes.find(t => t.id === obs.metric_type_id)
      if (mt && obs.value !== null) {
        const key = `${mwd.member.id}::${mt.key}`
        if (!trendDataMap[key]) trendDataMap[key] = []
        trendDataMap[key].push(obs.value)
      }
    }
  }

  // Sort: critical first, then by member
  const sortedFlags = [...flags].sort((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 }
    return sevOrder[a.severity] - sevOrder[b.severity]
  })

  const handleCardClick = (flag: DetectionFlag) => {
    setSelectedFlag(flag)
    setSelectedMember(memberById[flag.member_id] ?? null)
  }

  // Find relevant observations for the detail modal
  const modalObservations = selectedFlag && selectedMember
    ? membersWithData
        .find(m => m.member.id === selectedMember.id)
        ?.recent_observations.filter(
          obs => metricTypes.find(mt => mt.id === obs.metric_type_id)?.key === selectedFlag.metric_key
        ) ?? []
    : []

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {sortedFlags.map((flag, idx) => {
          const member = memberById[flag.member_id]
          if (!member) return null

          const metricType = metricTypeByKey[flag.metric_key]
          const trendData = trendDataMap[`${member.id}::${flag.metric_key}`] ?? []

          return (
            <HighlightCard
              key={`${flag.member_id}-${flag.metric_key}-${idx}`}
              flag={flag}
              member={member}
              metricType={metricType}
              trendData={trendData}
              onClick={() => handleCardClick(flag)}
            />
          )
        })}
      </div>

      {/* Detail Modal */}
      {selectedFlag && selectedMember && (
        <MetricDetailModal
          isOpen={!!selectedFlag}
          onClose={() => {
            setSelectedFlag(null)
            setSelectedMember(null)
          }}
          flag={selectedFlag}
          member={selectedMember}
          metricType={metricTypeByKey[selectedFlag.metric_key]}
          observations={modalObservations}
        />
      )}
    </>
  )
}
