'use client'

/**
 * MetricsGrid
 * Full all-metrics grid with category tabs, member filter, and expandable trend charts.
 */

import { useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Activity,
  Moon,
  Heart,
  Brain,
  Apple,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn, getMemberColor, getMemberInitials, formatMetricValue, getScoreStatus } from '@/lib/utils'
import type { MemberWithData, MetricType, MetricObservation, MetricCategory } from '@/types'

interface MetricsGridProps {
  membersWithData: MemberWithData[]
  metricTypes: MetricType[]
}

type CategoryFilter = 'all' | MetricCategory

const CATEGORY_TABS: Array<{ key: CategoryFilter; label: string; icon: React.FC<{ className?: string }> }> = [
  { key: 'all', label: 'All', icon: ({ className }) => <Layers className={className} /> },
  { key: 'activity', label: 'Activity', icon: ({ className }) => <Activity className={className} /> },
  { key: 'sleep', label: 'Sleep', icon: ({ className }) => <Moon className={className} /> },
  { key: 'heart', label: 'Heart', icon: ({ className }) => <Heart className={className} /> },
  { key: 'stress', label: 'Stress', icon: ({ className }) => <Brain className={className} /> },
  { key: 'nutrition', label: 'Nutrition', icon: ({ className }) => <Apple className={className} /> },
]

// ============================================================
// METRIC TILE
// ============================================================

interface MetricTileProps {
  member: MemberWithData['member']
  metricType: MetricType
  observations: MetricObservation[]
  latestValue: number | null
}

function MetricTile({ member, metricType, observations, latestValue }: MetricTileProps) {
  const [expanded, setExpanded] = useState(false)
  const memberColor = getMemberColor(member.id)

  // Determine status
  const { min, max, higher_is_better } = {
    min: metricType.normal_range_min,
    max: metricType.normal_range_max,
    higher_is_better: metricType.higher_is_better,
  }

  let statusDotColor = 'bg-gray-600'
  if (latestValue !== null) {
    const belowMin = min !== null && latestValue < min
    const aboveMax = max !== null && latestValue > max

    if ((!higher_is_better && aboveMax) || (higher_is_better && belowMin)) {
      statusDotColor = 'bg-red-500'
    } else if (belowMin || aboveMax) {
      statusDotColor = 'bg-amber-500'
    } else {
      statusDotColor = 'bg-emerald-500'
    }
  }

  // Build chart data (chronological)
  const chartData = [...observations]
    .filter(o => o.value !== null)
    .sort((a, b) => a.observed_date.localeCompare(b.observed_date))
    .slice(-14)
    .map(o => ({
      date: o.observed_date.slice(5),  // MM-DD
      value: o.value as number,
    }))

  const chartColor = statusDotColor === 'bg-red-500'
    ? '#ef4444'
    : statusDotColor === 'bg-amber-500'
    ? '#f59e0b'
    : '#10b981'

  return (
    <div
      className={cn(
        'bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-all duration-200',
        'hover:border-gray-700',
        expanded && 'border-gray-700'
      )}
    >
      {/* Tile header */}
      <div className="p-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Member pill */}
          <div
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium mb-1.5"
            style={{
              backgroundColor: memberColor + '20',
              border: `1px solid ${memberColor}40`,
              color: memberColor,
            }}
          >
            <span
              className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
              style={{ backgroundColor: memberColor }}
            >
              {getMemberInitials(member.member_name)[0]}
            </span>
            {member.member_name.split(' ')[0]}
          </div>

          {/* Metric name */}
          <p className="text-xs text-gray-400 leading-tight truncate">{metricType.label}</p>

          {/* Value */}
          <p className="text-lg font-bold tabular-nums text-gray-50 mt-1">
            {latestValue !== null ? formatMetricValue(latestValue, null) : '—'}
            {latestValue !== null && metricType.unit && (
              <span className="text-[10px] font-normal text-gray-500 ml-1">{metricType.unit}</span>
            )}
          </p>
        </div>

        {/* Status dot + expand toggle */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={cn('status-dot mt-1', statusDotColor)} />
          {chartData.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-600 hover:text-gray-400 transition-colors"
              aria-label={expanded ? 'Collapse chart' : 'Expand chart'}
            >
              {expanded
                ? <ChevronUp className="w-3.5 h-3.5" />
                : <ChevronDown className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      </div>

      {/* Mini sparkline bars */}
      {!expanded && chartData.length > 1 && (
        <div className="px-3 pb-2.5">
          <SparklineBars data={chartData.map(d => d.value)} color={chartColor} />
        </div>
      )}

      {/* Expanded area chart */}
      {expanded && chartData.length > 1 && (
        <div className="px-3 pb-3 pt-1">
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id={`g-${member.id}-${metricType.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}
                  labelStyle={{ color: '#9ca3af' }}
                  itemStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number) => [
                    formatMetricValue(value, metricType.unit),
                    metricType.label,
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartColor}
                  strokeWidth={1.5}
                  fill={`url(#g-${member.id}-${metricType.key})`}
                  dot={false}
                  activeDot={{ r: 3, fill: chartColor }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SPARKLINE BARS (compact mini visualization)
// ============================================================

function SparklineBars({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  return (
    <div className="flex items-end gap-0.5 h-5">
      {data.slice(-10).map((val, i) => {
        const heightPct = ((val - min) / range) * 100
        const height = Math.max(15, heightPct)
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${height}%`,
              backgroundColor: i === data.length - 1 ? color : color + '50',
            }}
          />
        )
      })}
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function MetricsGrid({ membersWithData, metricTypes }: MetricsGridProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all')
  const [activeMemberId, setActiveMemberId] = useState<string | 'all'>('all')

  // Build observation lookup: member_id + metric_type_id -> observations[]
  const obsLookup = useMemo(() => {
    const map: Record<string, MetricObservation[]> = {}
    for (const mwd of membersWithData) {
      for (const obs of mwd.recent_observations) {
        const key = `${mwd.member.id}::${obs.metric_type_id}`
        if (!map[key]) map[key] = []
        map[key].push(obs)
      }
    }
    return map
  }, [membersWithData])

  // Latest value lookup
  const latestValueLookup = useMemo(() => {
    const map: Record<string, number | null> = {}
    for (const [key, obs] of Object.entries(obsLookup)) {
      const sorted = [...obs].sort((a, b) => b.observed_date.localeCompare(a.observed_date))
      map[key] = sorted[0]?.value ?? null
    }
    return map
  }, [obsLookup])

  // Filter metric types by category
  const filteredMetricTypes = useMemo(() => {
    if (activeCategory === 'all') return metricTypes
    return metricTypes.filter(mt => mt.category === activeCategory)
  }, [metricTypes, activeCategory])

  // Filter members
  const filteredMembers = useMemo(() => {
    if (activeMemberId === 'all') return membersWithData
    return membersWithData.filter(mwd => mwd.member.id === activeMemberId)
  }, [membersWithData, activeMemberId])

  const allMembers = membersWithData.map(m => m.member)

  return (
    <div className="space-y-4">
      {/* Controls: Category tabs + Member filter */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Category tabs */}
        <div className="flex items-center gap-1 bg-gray-900/80 border border-gray-800 rounded-xl p-1">
          {CATEGORY_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
                activeCategory === key
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/20'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Member filter pills */}
        {allMembers.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveMemberId('all')}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                activeMemberId === 'all'
                  ? 'bg-gray-700 text-gray-100 border-gray-600'
                  : 'bg-transparent text-gray-500 border-gray-700 hover:text-gray-300 hover:border-gray-600'
              )}
            >
              All Members
            </button>
            {allMembers.map(member => (
              <button
                key={member.id}
                onClick={() => setActiveMemberId(member.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  activeMemberId === member.id
                    ? 'text-white border-transparent'
                    : 'bg-transparent border-gray-700 text-gray-500 hover:text-gray-300'
                )}
                style={
                  activeMemberId === member.id
                    ? { backgroundColor: getMemberColor(member.id), borderColor: getMemberColor(member.id) }
                    : {}
                }
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: getMemberColor(member.id) }}
                >
                  {getMemberInitials(member.member_name)}
                </span>
                {member.member_name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Metrics grid */}
      {filteredMetricTypes.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No metrics in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredMembers.flatMap(mwd =>
            filteredMetricTypes.map(mt => {
              const obsKey = `${mwd.member.id}::${mt.id}`
              const observations = obsLookup[obsKey] ?? []
              const latestValue = latestValueLookup[obsKey] ?? null

              // Skip if no data at all
              if (observations.length === 0 && latestValue === null) return null

              return (
                <MetricTile
                  key={`${mwd.member.id}::${mt.id}`}
                  member={mwd.member}
                  metricType={mt}
                  observations={observations}
                  latestValue={latestValue}
                />
              )
            }).filter(Boolean)
          )}
        </div>
      )}

      {/* Empty state */}
      {filteredMembers.flatMap(mwd =>
        filteredMetricTypes.map(mt => {
          const obsKey = `${mwd.member.id}::${mt.id}`
          return obsLookup[obsKey]?.length ?? 0
        })
      ).every(count => count === 0) && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No metric observations found for the selected filters.
        </div>
      )}
    </div>
  )
}
