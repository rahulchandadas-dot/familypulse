'use client'

/**
 * DashboardView
 * Main client component that renders the full 3-section dashboard layout.
 * Sections: Recommendations → Health Highlights → All Metrics
 * Includes floating chat button and chat panel.
 */

import { useState } from 'react'
import { MessageCircle, X, Clock } from 'lucide-react'
import Header from '@/components/layout/Header'
import RecommendationCards from './RecommendationCards'
import HealthHighlights from './HealthHighlights'
import MetricsGrid from './MetricsGrid'
import ChatInterface from '@/components/chat/ChatInterface'
import { cn, formatDate, formatRelativeDate } from '@/lib/utils'
import type { DashboardData } from '@/types'

interface DashboardViewProps {
  data: DashboardData
}

export default function DashboardView({ data }: DashboardViewProps) {
  const [chatOpen, setChatOpen] = useState(false)
  const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined)

  const { family, members, active_recommendations, metric_types, detection_result, last_ingested_at } = data

  const memberList = members.map(m => m.member)

  // Collect all flags across members for the highlights section
  const allFlags = members.flatMap(m => m.flags)

  // Empty state: no members or no data
  const hasData = members.length > 0
  const hasObservations = members.some(m => m.recent_observations.length > 0)

  if (!hasData) {
    return (
      <div className="min-h-screen bg-gray-950">
        <Header family={family} members={[]} />
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-6 px-6">
          <div className="text-center max-w-md">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6">
              <MessageCircle className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-50 mb-3">No Health Data Yet</h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Upload your family health data Excel file and click{' '}
              <strong className="text-gray-300">Sync Data</strong> in the header to get started.
            </p>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-left">
              <p className="text-xs text-gray-500 font-mono">EXCEL_FILE_PATH=./data/family_health_data.xlsx</p>
              <p className="text-xs text-gray-600 mt-1">Set in your .env.local file</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Header family={family} members={memberList} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">

        {/* Last synced indicator */}
        {last_ingested_at && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Last synced{' '}
              <span className="text-gray-500">
                {formatRelativeDate(last_ingested_at)}
              </span>
              {' — '}
              <span className="text-gray-600">
                {formatDate(last_ingested_at, 'MMM d, yyyy h:mm a')}
              </span>
            </span>
          </div>
        )}

        {/* ======================================================
            SECTION 1: RECOMMENDED ACTIONS
            ====================================================== */}
        <section aria-labelledby="recommendations-heading">
          <div className="section-header" id="recommendations-heading">
            Recommended Actions
          </div>
          <RecommendationCards
            recommendations={active_recommendations}
            members={memberList}
            familyId={family.id}
          />
        </section>

        {/* ======================================================
            SECTION 2: HEALTH HIGHLIGHTS
            ====================================================== */}
        {hasObservations && (
          <section aria-labelledby="highlights-heading">
            <div className="section-header" id="highlights-heading">
              Health Highlights
            </div>
            <HealthHighlights
              flags={allFlags}
              members={memberList}
              membersWithData={members}
              metricTypes={metric_types}
            />
          </section>
        )}

        {/* ======================================================
            SECTION 3: ALL METRICS
            ====================================================== */}
        {hasObservations && (
          <section aria-labelledby="metrics-heading">
            <div className="section-header" id="metrics-heading">
              All Metrics
            </div>
            <MetricsGrid
              membersWithData={members}
              metricTypes={metric_types}
            />
          </section>
        )}

        {/* No observations state */}
        {!hasObservations && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center">
              <Clock className="w-6 h-6 text-gray-500" />
            </div>
            <p className="text-gray-500 text-sm">
              Family members found, but no health observations yet.
              Click <strong className="text-gray-400">Sync Data</strong> to load metrics.
            </p>
          </div>
        )}

        {/* Bottom padding for floating button */}
        <div className="h-20" />
      </main>

      {/* ======================================================
          FLOATING CHAT BUTTON
          ====================================================== */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-40 transition-all duration-300',
          chatOpen && 'opacity-0 pointer-events-none'
        )}
      >
        <button
          onClick={() => setChatOpen(true)}
          className="group flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow-blue transition-all duration-200 hover:scale-105 active:scale-95"
          aria-label="Open health chat"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-semibold hidden sm:inline">Ask about health</span>
          {/* Notification dot if there are critical flags */}
          {allFlags.some(f => f.severity === 'critical') && (
            <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
          )}
        </button>
      </div>

      {/* ======================================================
          CHAT PANEL
          ====================================================== */}
      <ChatInterface
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        familyId={family.id}
        members={memberList}
        sessionId={chatSessionId}
        onSessionCreated={setSessionId => setChatSessionId(setSessionId)}
      />
    </div>
  )
}
