'use client'

/**
 * MetricDetailModal
 * Detailed view of a single flagged health metric.
 * Shows explanation, trend chart, and approved source citations.
 */

import { useEffect } from 'react'
import { X, ExternalLink, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { cn, getSeverityColor, getMemberColor, formatDate, formatMetricValue } from '@/lib/utils'
import { getSourcesByTopic } from '@/lib/retrieval/sources'
import { SHORT_DISCLAIMER } from '@/lib/retrieval/grounding'
import type { DetectionFlag, FamilyMember, MetricType, MetricObservation } from '@/types'

interface MetricDetailModalProps {
  isOpen: boolean
  onClose: () => void
  flag: DetectionFlag
  member: FamilyMember
  metricType: MetricType | undefined
  observations: MetricObservation[]
}

// ============================================================
// STATIC METRIC DEFINITIONS (generic — shown for all members)
// ============================================================

const METRIC_WHAT: Record<string, string> = {
  steps: 'Total number of steps taken during the day, measured by your wearable device.',
  sleep_hours: 'Total amount of time spent sleeping each night.',
  resting_heart_rate: 'Your heart rate when you are completely at rest, measured in beats per minute (bpm).',
  hrv: 'Heart Rate Variability (HRV) measures the variation in time between heartbeats, in milliseconds.',
  stress_score: 'A composite score estimating current physiological stress level, derived from HRV, heart rate, and activity patterns.',
  readiness_score: 'A composite score (0–100) reflecting readiness for physical and mental activity, based on sleep, HRV, and recovery.',
  calories_burned: 'Total estimated daily energy expenditure including both basal metabolic rate and activity.',
  activity_minutes: 'Total minutes of moderate-to-vigorous physical activity during the day.',
  blood_oxygen: 'Blood oxygen saturation (SpO2) — the percentage of hemoglobin carrying oxygen in the blood.',
  glucose: 'Blood glucose level, typically measured while fasting, in milligrams per deciliter (mg/dL).',
}

// ============================================================
// PERSONALIZED CONTENT GENERATORS
// ============================================================

interface PersonalizedContent {
  whyItMatters: string
  likelyDrivers: string[]
  nextSteps: string[]
}

function getPersonalizedContent(
  firstName: string,
  metricKey: string,
  currentValue: number | null,
  normalMin: number | null,
  normalMax: number | null,
  trend: string | null | undefined,
  severity: 'critical' | 'warning' | 'info',
  higherIsBetter: boolean,
): PersonalizedContent {
  const val = currentValue ?? 0
  const isBelowMin = normalMin !== null && val < normalMin
  const isAboveMax = normalMax !== null && val > normalMax
  const isOutOfRange = isBelowMin || isAboveMax
  const trendLabel = trend ?? 'stable'
  const isImproving = trendLabel === 'improving'
  const isDeclining = trendLabel === 'declining'

  // Direction descriptor relative to normal range
  const rangeDesc = isBelowMin
    ? `below the normal range (${normalMin}${normalMax ? `–${normalMax}` : '+'}`
    : isAboveMax
    ? `above the normal range (${normalMin ? `${normalMin}–` : ''}${normalMax}`
    : 'within normal range'

  const trendSentence = isImproving
    ? ` The trend is moving in the right direction — ${firstName}'s reading has been improving recently.`
    : isDeclining
    ? ` The trend is concerning — ${firstName}'s reading has been declining over the past several days.`
    : ` The reading has been relatively stable recently.`

  const urgencyPrefix = severity === 'critical'
    ? `This is a high-priority concern. `
    : severity === 'warning'
    ? `This warrants attention. `
    : ``

  switch (metricKey) {
    case 'steps': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName}'s step count of ${val.toLocaleString()} is ${rangeDesc}). Low daily movement is linked to reduced cardiovascular health, lower energy levels, and poorer metabolic function.${trendSentence}`
        : `${firstName}'s step count of ${val.toLocaleString()} is in a healthy range. Maintaining this level supports cardiovascular health and overall wellbeing.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? ['Sedentary work or school day with limited movement breaks', 'Irregular routine or schedule disruption', isDeclining ? 'Activity has been trending downward over the past week' : ''].filter(Boolean)
        : ['Consistent daily movement habit']
      const nextSteps = isBelowMin
        ? [
            `Set a goal of ${Math.round((val + 1500) / 500) * 500} steps tomorrow — a modest increase from today`,
            'Add a 10-minute walk after at least one meal',
            isDeclining ? `Try to reverse the recent downward trend with one active outing this week` : 'Keep building momentum with consistent daily walks',
            severity === 'critical' ? 'Consider scheduling activity into the calendar as a non-negotiable commitment' : 'Use movement reminders every hour during sedentary periods',
          ]
        : ['Keep up the current activity level', 'Aim for variety — try mixing walking with other activities']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'sleep_hours': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName} got ${val} hours of sleep, which is ${rangeDesc}). Insufficient sleep impairs cognitive performance, emotional regulation, immune function, and physical recovery.${trendSentence}`
        : isAboveMax
        ? `${firstName} slept ${val} hours, which is above the typical range. Occasionally sleeping longer is normal during illness or recovery, but consistently oversleeping can signal other health issues.${trendSentence}`
        : `${firstName}'s sleep duration of ${val} hours is in the healthy range.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? [
            'Late bedtime or irregular sleep schedule',
            'Screen exposure close to bedtime disrupting melatonin production',
            isDeclining ? 'Sleep duration has been shortening progressively this week' : 'Stress or anxiety affecting ability to fall or stay asleep',
          ]
        : isAboveMax
        ? ['Recovery from illness, intense activity, or accumulated sleep debt', 'Possible disrupted circadian rhythm']
        : ['Consistent sleep schedule is being maintained']
      const nextSteps = isBelowMin
        ? [
            `Target at least ${normalMin} hours tonight — move bedtime ${Math.round(((normalMin ?? 7) - val) * 60)} minutes earlier`,
            severity === 'critical' ? 'This is a persistent pattern — consider a formal sleep routine or consult a doctor' : 'Set a consistent wake-up alarm (even on weekends) to anchor the sleep cycle',
            'Avoid screens and bright light for 45–60 minutes before bed',
            isDeclining ? 'Address any stressors that may be disrupting sleep this week' : 'Keep the bedroom cool, dark, and quiet',
          ]
        : ['Maintain the current sleep schedule', 'Avoid large changes to bedtime or wake time on weekends']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'resting_heart_rate': {
      // For RHR, higher is worse
      const whyItMatters = isAboveMax
        ? `${urgencyPrefix}${firstName}'s resting heart rate of ${val} bpm is ${rangeDesc}). An elevated RHR can reflect physiological stress, poor recovery, dehydration, illness, or insufficient aerobic fitness.${trendSentence}`
        : isBelowMin
        ? `${firstName}'s resting heart rate of ${val} bpm is below the typical range. This is often seen in highly trained individuals and is generally not a concern, but very low readings should be monitored.${trendSentence}`
        : `${firstName}'s resting heart rate of ${val} bpm is within the healthy range.${trendSentence}`
      const likelyDrivers = isAboveMax
        ? [
            'Elevated physiological stress or anxiety',
            isDeclining && higherIsBetter ? '' : isDeclining ? 'RHR has been rising progressively this week, suggesting accumulating stress or fatigue' : 'Possible dehydration or recent illness',
            'Insufficient sleep reducing overnight recovery',
          ].filter(Boolean)
        : ['Cardiovascular fitness is contributing to a healthy heart rate']
      const nextSteps = isAboveMax
        ? [
            'Prioritize 7–9 hours of sleep tonight to support overnight cardiac recovery',
            'Check hydration — aim for 8 glasses of water today',
            severity === 'critical' ? 'If elevated RHR persists for more than 3 days, consult a healthcare provider' : 'Reduce intense exercise today and focus on light movement or rest',
            isDeclining ? 'The upward trend is concerning — identify and address the root stressor' : 'Practice diaphragmatic breathing for 5 minutes to activate the parasympathetic system',
          ]
        : ['No immediate action needed', 'Continue regular aerobic exercise to maintain cardiovascular health']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'hrv': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName}'s HRV of ${val} ms is ${rangeDesc}). Low HRV signals that the autonomic nervous system is under strain — often due to stress, poor sleep, or inadequate recovery. It is one of the strongest indicators that the body needs rest.${trendSentence}`
        : `${firstName}'s HRV of ${val} ms is in a healthy range, suggesting good autonomic balance and recovery.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? [
            isDeclining ? 'HRV has been declining this week, indicating cumulative stress or fatigue' : 'Acute stressor or disrupted sleep the night before',
            'High physiological stress load (mental or physical)',
            'Insufficient recovery between demanding days',
          ]
        : ['Good sleep and recovery is supporting autonomic balance']
      const nextSteps = isBelowMin
        ? [
            severity === 'critical' ? `${firstName}'s HRV is critically low — today should be a full rest or very light activity day` : 'Treat today as a recovery day — avoid intense training',
            'Practice slow, deep breathing (4 counts in, 6 counts out) for 5–10 minutes',
            isDeclining ? 'Address the source of the declining trend — look at sleep and stress patterns this week' : 'Ensure 7–9 hours of quality sleep tonight',
            'Reduce caffeine and alcohol, which suppress HRV recovery',
          ]
        : ['Continue prioritizing sleep and recovery', 'Maintain balance between training load and rest days']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'stress_score': {
      // Higher stress score is worse
      const whyItMatters = isAboveMax
        ? `${urgencyPrefix}${firstName}'s stress score of ${val} is ${rangeDesc}). Elevated physiological stress suppresses immune function, disrupts sleep, reduces HRV, and can have cumulative effects on cardiovascular health if sustained.${trendSentence}`
        : `${firstName}'s stress level of ${val} is within a manageable range.${trendSentence}`
      const likelyDrivers = isAboveMax
        ? [
            isDeclining ? 'Stress has been accumulating over several days without adequate recovery' : 'Acute stressor today (work, school, personal)',
            'Sleep deficit amplifying stress response',
            severity === 'critical' ? 'Multiple simultaneous stressors may be compounding the physiological response' : 'Elevated activity load without sufficient recovery',
          ]
        : ['Current lifestyle is maintaining a healthy stress balance']
      const nextSteps = isAboveMax
        ? [
            `${firstName} would benefit from an intentional decompression activity today — even 15 minutes of calm`,
            'A walk outside (especially in a natural setting) can significantly reduce physiological stress markers',
            isDeclining ? 'The trend shows stress building — prevent escalation by addressing it today rather than letting it compound' : 'Identify the primary driver of stress today and see if anything can be reduced or delegated',
            severity === 'critical' ? 'Consider limiting additional commitments today — the body needs recovery time' : 'Deep breathing or a brief mindfulness practice can provide immediate relief',
          ]
        : ['Continue current stress management practices', 'Keep monitoring — stress can shift quickly during demanding weeks']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'readiness_score': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName}'s readiness score of ${val} is ${rangeDesc}), meaning the body is signaling it needs more recovery before taking on demanding tasks or intense exercise.${trendSentence}`
        : `${firstName}'s readiness score of ${val} is healthy, indicating good recovery and capacity for the day ahead.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? [
            'Poor sleep quality or insufficient duration the prior night',
            isDeclining ? 'Readiness has been declining progressively — accumulated fatigue over multiple days' : 'Stress load exceeding current recovery capacity',
            'Insufficient rest between high-effort days',
          ]
        : ['Sleep, HRV, and recovery metrics are all contributing positively']
      const nextSteps = isBelowMin
        ? [
            severity === 'critical' ? `${firstName}'s readiness is critically low — this is not a day for intense training or major demands` : `Match today's effort to the readiness level — lighter activity is appropriate`,
            'Focus tonight on maximizing sleep quality: consistent bedtime, no screens before bed, cool room',
            isDeclining ? 'The downward trend needs to be reversed — look at the past 3–5 days for the root cause (sleep debt, high stress, over-training)' : 'Avoid adding additional stressors today if possible',
          ]
        : [`${firstName} is well-recovered — a good day for physical or mental challenges`, 'Maintain the habits that are supporting this readiness level']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'activity_minutes': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName} logged ${val} active minutes, which is ${rangeDesc}). The CDC recommends at least 150 minutes of moderate activity per week. Regular movement reduces chronic disease risk and supports mental health.${trendSentence}`
        : `${firstName}'s active minutes of ${val} meets or exceeds the recommended daily target.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? [
            'Sedentary day — limited structured or incidental movement',
            isDeclining ? 'Activity has been decreasing over the past several days' : 'Schedule or workload leaving little time for movement',
          ]
        : ['Consistent movement habit is contributing to good activity levels']
      const nextSteps = isBelowMin
        ? [
            `Aim for at least ${normalMin} active minutes tomorrow — even split across multiple short sessions`,
            'A 20-minute walk counts — it does not need to be a gym session',
            isDeclining ? 'Reverse the recent decline with one intentional activity session this week' : 'Try pairing activity with something enjoyable (podcast, music, family member)',
          ]
        : ['Continue the current activity routine', 'Consider adding variety to maintain engagement long-term']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'blood_oxygen': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName}'s SpO2 reading of ${val}% is ${rangeDesc}%). Blood oxygen below 95% can indicate respiratory or circulatory issues. Values below 90% are considered a medical emergency.${trendSentence}`
        : `${firstName}'s blood oxygen of ${val}% is in the healthy range, indicating good respiratory function.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? [
            severity === 'critical' ? 'Critically low SpO2 may indicate a respiratory or cardiac issue requiring immediate attention' : 'Possible respiratory congestion or shallow breathing pattern',
            'Sleep-disordered breathing (sleep apnea) can cause drops in overnight SpO2',
            'Wearable sensor fit or skin contact may affect reading accuracy — verify with a pulse oximeter',
          ]
        : ['Respiratory and circulatory function appear healthy']
      const nextSteps = isBelowMin
        ? [
            severity === 'critical' ? `⚠️ ${firstName}'s SpO2 is critically low — seek medical evaluation today` : 'Re-check the reading with a dedicated pulse oximeter to confirm accuracy',
            'Practice deep, slow diaphragmatic breathing — inhale for 4 counts, exhale for 6',
            'Ensure the sleeping environment is well-ventilated tonight',
            'If readings remain below 95% consistently, consult a healthcare provider',
          ]
        : ['No immediate action needed', 'Continue monitoring — SpO2 can drop during illness or high altitude']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'glucose': {
      const whyItMatters = isAboveMax
        ? `${urgencyPrefix}${firstName}'s blood glucose of ${val} mg/dL is ${rangeDesc}). Fasting glucose between 100–125 mg/dL is considered prediabetic range; above 126 mg/dL warrants medical evaluation. Sustained elevated glucose can lead to metabolic and cardiovascular complications.${trendSentence}`
        : isBelowMin
        ? `${firstName}'s blood glucose of ${val} mg/dL is below the typical range. Low blood sugar (hypoglycemia) can cause dizziness, fatigue, and in severe cases, loss of consciousness.${trendSentence}`
        : `${firstName}'s blood glucose of ${val} mg/dL is within the healthy fasting range.${trendSentence}`
      const likelyDrivers = isAboveMax
        ? [
            'High intake of refined carbohydrates or added sugars',
            isDeclining ? 'Glucose has been elevated for multiple consecutive days' : 'Sedentary period following a carbohydrate-rich meal',
            severity === 'critical' ? 'Readings in this range should be evaluated by a healthcare provider' : 'Stress hormones (cortisol) can transiently raise blood glucose',
          ]
        : isBelowMin
        ? ['Skipped meal or insufficient carbohydrate intake', 'Intense exercise without adequate fueling']
        : ['Diet and metabolic function are well-balanced']
      const nextSteps = isAboveMax
        ? [
            'Reduce refined carbohydrates and sugary beverages today',
            'A 15-minute walk after meals can meaningfully lower postprandial glucose',
            severity === 'critical' ? `${firstName} should discuss these readings with a doctor — persistent levels above ${val} mg/dL warrant evaluation` : 'Focus on fiber-rich foods at the next meal to slow glucose absorption',
            isDeclining ? 'The upward trend is a warning sign — take dietary steps now before it progresses further' : 'Stay well-hydrated — dehydration can concentrate blood glucose',
          ]
        : isBelowMin
        ? ['Have a small, balanced snack with protein and complex carbohydrates', 'Do not skip meals, especially before exercise']
        : ['Continue current dietary habits', 'Maintain regular meal timing to keep glucose stable']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    case 'calories_burned': {
      const whyItMatters = isBelowMin
        ? `${urgencyPrefix}${firstName}'s total energy expenditure of ${val} kcal is ${rangeDesc}). Very low calorie burn may reflect a highly sedentary day, which over time is associated with metabolic slowdown and reduced cardiovascular health.${trendSentence}`
        : `${firstName}'s calorie expenditure of ${val} kcal is within a healthy range for their activity level.${trendSentence}`
      const likelyDrivers = isBelowMin
        ? ['Largely sedentary day with minimal movement', isDeclining ? 'Activity level has been declining over the past several days' : 'Rest day or illness reducing overall movement']
        : ['Regular activity is maintaining a healthy energy expenditure level']
      const nextSteps = isBelowMin
        ? [
            'Add one intentional movement session tomorrow — even a 20-minute walk helps',
            'Look for ways to increase incidental movement (standing desk, walking calls)',
          ]
        : ['Maintain the current activity level', 'Focus on consistency over intensity']
      return { whyItMatters, likelyDrivers, nextSteps }
    }

    default: {
      const whyItMatters = isOutOfRange
        ? `${firstName}'s ${metricKey.replace(/_/g, ' ')} reading of ${val} is outside the expected range.${trendSentence}`
        : `${firstName}'s reading is within the normal range.${trendSentence}`
      return {
        whyItMatters,
        likelyDrivers: isOutOfRange ? ['Value is outside the expected range — review recent patterns'] : ['Reading is within normal parameters'],
        nextSteps: isOutOfRange ? ['Monitor over the next few days', 'Consult a healthcare provider if the reading remains abnormal'] : ['No action needed — continue current habits'],
      }
    }
  }
}

// ============================================================
// CUSTOM TOOLTIP
// ============================================================

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
  unit?: string | null
}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="font-semibold text-gray-100">
        {formatMetricValue(payload[0].value, unit)}
      </p>
    </div>
  )
}

// ============================================================
// MAIN MODAL
// ============================================================

export default function MetricDetailModal({
  isOpen,
  onClose,
  flag,
  member,
  metricType,
  observations,
}: MetricDetailModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const severityColors = getSeverityColor(flag.severity)
  const memberColor = getMemberColor(member.id)
  const firstName = member.member_name.split(' ')[0]
  const whatText = metricType ? METRIC_WHAT[metricType.key] : null
  const personalized = metricType
    ? getPersonalizedContent(
        firstName,
        metricType.key,
        flag.current_value,
        flag.normal_range_min ?? metricType.normal_range_min ?? null,
        flag.normal_range_max ?? metricType.normal_range_max ?? null,
        flag.trend,
        flag.severity,
        metricType.higher_is_better ?? true,
      )
    : null

  // Build chart data
  const sortedObs = [...observations]
    .filter(o => o.value !== null)
    .sort((a, b) => a.observed_date.localeCompare(b.observed_date))

  const chartData = sortedObs.map(o => ({
    date: formatDate(o.observed_date, 'MMM d'),
    value: o.value as number,
  }))

  const trendValue = flag.trend
  const TrendIcon =
    trendValue === 'improving'
      ? TrendingUp
      : trendValue === 'declining'
      ? TrendingDown
      : Minus

  // Get relevant sources
  const sources = metricType
    ? getSourcesByTopic(metricType.key).slice(0, 3)
    : []

  // Chart color based on higher_is_better + current status
  const isInRange =
    (flag.current_value !== null &&
      (metricType?.normal_range_min === null || (flag.current_value ?? 0) >= (metricType?.normal_range_min ?? 0)) &&
      (metricType?.normal_range_max === null || (flag.current_value ?? 0) <= (metricType?.normal_range_max ?? 0)))
  const chartColor = isInRange ? '#10b981' : (flag.severity === 'critical' ? '#ef4444' : '#f59e0b')

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`${flag.metric_label} detail`}
      >
        <div
          className={cn(
            'relative w-full max-w-lg max-h-[90vh] overflow-y-auto',
            'bg-gray-900 border rounded-2xl shadow-2xl',
            severityColors.border
          )}
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors z-10"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: memberColor }}
                >
                  {member.member_name[0]?.toUpperCase()}
                </span>
                <span className="text-sm text-gray-400">{member.member_name}</span>
                <span
                  className={cn(
                    'ml-auto text-xs font-medium px-2 py-0.5 rounded-full',
                    severityColors.bg,
                    severityColors.text
                  )}
                >
                  {severityColors.label}
                </span>
              </div>

              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-50">{flag.metric_label}</h2>
                  {metricType?.category && (
                    <p className="text-xs text-gray-500 capitalize mt-0.5">{metricType.category}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold tabular-nums text-gray-50">
                    {formatMetricValue(flag.current_value, null)}
                  </p>
                  <p className="text-xs text-gray-500">{metricType?.unit ?? ''}</p>
                </div>
              </div>

              {/* Normal range indicator */}
              {(flag.normal_range_min !== null || flag.normal_range_max !== null) && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>Normal range:</span>
                  <span className="text-gray-300 font-medium">
                    {flag.normal_range_min ?? '—'}
                    {flag.normal_range_min !== null && flag.normal_range_max !== null && ' – '}
                    {flag.normal_range_max ?? ''}
                    {metricType?.unit ? ` ${metricType.unit}` : ''}
                  </span>
                  <TrendIcon
                    className={cn(
                      'w-3.5 h-3.5 ml-1',
                      trendValue === 'improving' ? 'text-emerald-400' :
                      trendValue === 'declining' ? 'text-red-400' : 'text-gray-500'
                    )}
                  />
                  <span className="capitalize text-gray-500">{trendValue ?? 'stable'} trend</span>
                </div>
              )}
            </div>

            {/* Sparkline / Trend Chart */}
            {chartData.length > 1 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                  7-Day Trend
                </p>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={chartColor} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      {flag.normal_range_min !== null && (
                        <ReferenceLine
                          y={flag.normal_range_min}
                          stroke="rgba(255,255,255,0.15)"
                          strokeDasharray="4 2"
                        />
                      )}
                      {flag.normal_range_max !== null && (
                        <ReferenceLine
                          y={flag.normal_range_max}
                          stroke="rgba(255,255,255,0.15)"
                          strokeDasharray="4 2"
                        />
                      )}
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip unit={metricType?.unit} />} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke={chartColor}
                        strokeWidth={2}
                        fill="url(#metricGradient)"
                        dot={{ r: 3, fill: chartColor, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: chartColor }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* What is this metric — generic */}
            {whatText && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  What is this metric?
                </p>
                <p className="text-sm text-gray-300 leading-relaxed">{whatText}</p>
              </div>
            )}

            {/* Personalized sections */}
            {personalized && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Why it matters for {firstName}
                  </p>
                  <p className="text-sm text-gray-300 leading-relaxed">{personalized.whyItMatters}</p>
                </div>

                {personalized.likelyDrivers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      What&apos;s likely driving this
                    </p>
                    <ul className="space-y-1.5">
                      {personalized.likelyDrivers.map((driver, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-amber-400 mt-0.5 flex-shrink-0">→</span>
                          {driver}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Suggested next steps for {firstName}
                  </p>
                  <ul className="space-y-1.5">
                    {personalized.nextSteps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-emerald-400 mt-0.5 flex-shrink-0">•</span>
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Approved sources */}
            {sources.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Learn More (Approved Sources)
                </p>
                <div className="space-y-2">
                  {sources.map(source => (
                    <a
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-gray-800/60 border border-gray-700/50 hover:border-gray-600 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-200 truncate group-hover:text-white">
                          {source.name}
                        </p>
                        <p className="text-[10px] text-gray-500">{source.organization}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-gray-300 flex-shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-800/40 border border-gray-700/30">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-500 leading-relaxed">{SHORT_DISCLAIMER}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
