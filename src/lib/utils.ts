/**
 * Utility Functions
 * Shared helpers for class merging, formatting, and UI logic.
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'
import type { Priority, FlagSeverity, EvidenceLevel } from '@/types'

// ============================================================
// CLASS MERGING
// ============================================================

/**
 * Merges Tailwind CSS class names, resolving conflicts intelligently.
 * Combines clsx (conditional classes) with tailwind-merge (conflict resolution).
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-blue-500', 'px-6') // => 'py-2 px-6 bg-blue-500'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ============================================================
// DATE FORMATTING
// ============================================================

/**
 * Formats an ISO date string for display.
 *
 * @param dateString - ISO date string (YYYY-MM-DD or full ISO)
 * @param formatStr - date-fns format string, defaults to 'MMM d, yyyy'
 * @returns Formatted date string, or 'Unknown' if invalid
 */
export function formatDate(
  dateString: string | null | undefined,
  formatStr = 'MMM d, yyyy'
): string {
  if (!dateString) return 'Unknown'
  try {
    const date = parseISO(dateString)
    if (!isValid(date)) return 'Unknown'
    return format(date, formatStr)
  } catch {
    return 'Unknown'
  }
}

/**
 * Formats a date as a relative label: "Today", "Yesterday", or formatted date.
 */
export function formatRelativeDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Unknown'
  try {
    const date = parseISO(dateString)
    if (!isValid(date)) return 'Unknown'

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(date)
    target.setHours(0, 0, 0, 0)

    const diffMs = today.getTime() - target.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return format(date, 'MMM d')
  } catch {
    return 'Unknown'
  }
}

// ============================================================
// METRIC VALUE FORMATTING
// ============================================================

/**
 * Formats a numeric metric value with appropriate precision and unit.
 *
 * @param value - The numeric value
 * @param unit - Optional unit string
 * @param precision - Decimal places (auto-determined if not specified)
 * @returns Formatted string e.g. "7,842 steps" or "72 bpm"
 */
export function formatMetricValue(
  value: number | null | undefined,
  unit?: string | null,
  precision?: number
): string {
  if (value === null || value === undefined) return '—'

  let formatted: string
  const autoPrec = precision ?? (value >= 1000 ? 0 : value >= 10 ? 0 : 1)

  if (value >= 1000 && autoPrec === 0) {
    formatted = value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  } else {
    formatted = value.toFixed(autoPrec)
  }

  return unit ? `${formatted} ${unit}` : formatted
}

/**
 * Formats a percentage score with a color-coded label.
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return '—'
  return `${Math.round(score)}`
}

// ============================================================
// COLOR UTILITIES
// ============================================================

/**
 * Returns Tailwind CSS classes for a priority level badge.
 *
 * @param priority - 1=high, 2=medium, 3=low
 */
export function getPriorityColor(priority: Priority): {
  text: string
  bg: string
  border: string
  glow: string
  label: string
} {
  switch (priority) {
    case 1:
      return {
        text: 'text-red-400',
        bg: 'bg-red-950/40',
        border: 'border-red-800/60',
        glow: 'shadow-glow-red',
        label: 'HIGH',
      }
    case 2:
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-950/40',
        border: 'border-amber-800/60',
        glow: 'shadow-glow-amber',
        label: 'MEDIUM',
      }
    case 3:
    default:
      return {
        text: 'text-slate-400',
        bg: 'bg-slate-900/40',
        border: 'border-slate-700/60',
        glow: '',
        label: 'LOW',
      }
  }
}

/**
 * Returns Tailwind CSS color classes for a flag severity level.
 */
export function getSeverityColor(severity: FlagSeverity): {
  text: string
  bg: string
  border: string
  dot: string
  label: string
} {
  switch (severity) {
    case 'critical':
      return {
        text: 'text-red-400',
        bg: 'bg-red-950/50',
        border: 'border-red-800/50',
        dot: 'bg-red-500',
        label: 'Critical',
      }
    case 'warning':
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-950/50',
        border: 'border-amber-800/50',
        dot: 'bg-amber-500',
        label: 'Warning',
      }
    case 'info':
    default:
      return {
        text: 'text-blue-400',
        bg: 'bg-blue-950/50',
        border: 'border-blue-800/50',
        dot: 'bg-blue-500',
        label: 'Info',
      }
  }
}

/**
 * Returns color classes for an evidence level badge.
 */
export function getEvidenceLevelColor(level: EvidenceLevel): {
  text: string
  bg: string
  label: string
} {
  switch (level) {
    case 'strong':
      return { text: 'text-emerald-400', bg: 'bg-emerald-950/40', label: 'Strong Evidence' }
    case 'moderate':
      return { text: 'text-teal-400', bg: 'bg-teal-950/40', label: 'Moderate Evidence' }
    case 'general':
      return { text: 'text-indigo-400', bg: 'bg-indigo-950/40', label: 'General Guidance' }
    case 'wellness':
      return { text: 'text-violet-400', bg: 'bg-violet-950/40', label: 'Wellness' }
    default:
      return { text: 'text-slate-400', bg: 'bg-slate-900/40', label: 'Guidance' }
  }
}

// ============================================================
// MEMBER COLORS
// ============================================================

/** Palette of avatar colors for family members */
const MEMBER_COLOR_PALETTE = [
  '#6366f1',  // indigo
  '#8b5cf6',  // violet
  '#06b6d4',  // cyan
  '#10b981',  // emerald
  '#f59e0b',  // amber
  '#ef4444',  // red
  '#ec4899',  // pink
  '#14b8a6',  // teal
]

/**
 * Returns a deterministic color for a family member based on their ID.
 * Consistent across sessions — same member always gets the same color.
 *
 * @param memberId - The member's UUID string
 * @returns Hex color string
 */
export function getMemberColor(memberId: string): string {
  // Simple hash: sum char codes
  let hash = 0
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash + memberId.charCodeAt(i)) % MEMBER_COLOR_PALETTE.length
  }
  return MEMBER_COLOR_PALETTE[hash]
}

/**
 * Returns the member color as a Tailwind-compatible style object.
 */
export function getMemberColorStyle(memberId: string): { backgroundColor: string } {
  return { backgroundColor: getMemberColor(memberId) }
}

/**
 * Returns initials from a member's display name (up to 2 characters).
 */
export function getMemberInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(part => part[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('')
}

// ============================================================
// STRING UTILITIES
// ============================================================

/**
 * Truncates a string to a maximum length with an ellipsis.
 *
 * @param text - Input string
 * @param maxLength - Maximum character count before truncation
 * @param ellipsis - Suffix for truncated strings, defaults to '...'
 */
export function truncate(
  text: string | null | undefined,
  maxLength: number,
  ellipsis = '...'
): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - ellipsis.length) + ellipsis
}

/**
 * Converts a metric key to a user-facing label.
 * e.g. 'resting_heart_rate' -> 'Resting Heart Rate'
 */
export function metricKeyToLabel(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Pluralizes a word based on a count.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return `1 ${singular}`
  return `${count} ${plural ?? singular + 's'}`
}

// ============================================================
// SCORE STATUS
// ============================================================

/**
 * Returns status label and color for a 0-100 score.
 */
export function getScoreStatus(score: number | null | undefined): {
  label: string
  color: string
  textColor: string
} {
  if (score === null || score === undefined) {
    return { label: 'No Data', color: 'bg-gray-800', textColor: 'text-gray-500' }
  }
  if (score >= 85) return { label: 'Excellent', color: 'bg-emerald-500', textColor: 'text-emerald-400' }
  if (score >= 70) return { label: 'Good', color: 'bg-teal-500', textColor: 'text-teal-400' }
  if (score >= 55) return { label: 'Fair', color: 'bg-amber-500', textColor: 'text-amber-400' }
  if (score >= 40) return { label: 'Low', color: 'bg-orange-500', textColor: 'text-orange-400' }
  return { label: 'Critical', color: 'bg-red-500', textColor: 'text-red-400' }
}
