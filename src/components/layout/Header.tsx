'use client'

/**
 * Header Component
 * Dark top navigation bar with logo, nav links, member pills, and sync button.
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  RefreshCw,
  LayoutDashboard,
  History,
  Settings,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { cn, getMemberColor, getMemberInitials } from '@/lib/utils'
import type { FamilyMember, Family } from '@/types'

interface HeaderProps {
  family: Family
  members: FamilyMember[]
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function Header({ family, members }: HeaderProps) {
  const pathname = usePathname()
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMessage, setSyncMessage] = useState('')

  const handleSync = async () => {
    if (syncState === 'syncing') return
    setSyncState('syncing')
    setSyncMessage('')

    try {
      const response = await fetch('/api/ingest', { method: 'POST' })
      const result = await response.json() as {
        success: boolean
        data?: { ingestion?: { rowsProcessed?: number } }
        error?: string
      }

      if (result.success) {
        const count = result.data?.ingestion?.rowsProcessed ?? 0
        setSyncMessage(`${count} rows synced`)
        setSyncState('success')
        setTimeout(() => {
          setSyncState('idle')
          setSyncMessage('')
          window.location.reload()
        }, 2000)
      } else {
        setSyncMessage(result.error ?? 'Sync failed')
        setSyncState('error')
        setTimeout(() => setSyncState('idle'), 3000)
      }
    } catch (err) {
      setSyncMessage('Network error')
      setSyncState('error')
      setTimeout(() => setSyncState('idle'), 3000)
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-800/80 bg-gray-950/90 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">

          {/* Logo & Wordmark */}
          <Link href="/dashboard" className="flex items-center gap-2.5 group flex-shrink-0">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-glow-blue group-hover:shadow-glow-blue transition-all duration-300">
              <Activity className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
              {/* Pulse animation dot */}
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse-slow" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-base font-bold text-gray-50 tracking-tight">
                Family<span className="text-indigo-400">Pulse</span>
              </span>
              <span className="text-[10px] text-gray-500 font-medium tracking-wide">
                {family.name}
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/20'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Right: Member Pills + Sync Button */}
          <div className="flex items-center gap-3">
            {/* Family Member Avatars */}
            {members.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                <span className="text-xs text-gray-600 mr-1">Tracking:</span>
                {members.slice(0, 5).map(member => (
                  <div
                    key={member.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-gray-800/80 border border-gray-700/60"
                    title={`${member.member_name}${member.relationship ? ` (${member.relationship})` : ''}`}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                      style={{ backgroundColor: getMemberColor(member.id) }}
                    >
                      {getMemberInitials(member.member_name)}
                    </span>
                    <span className="text-gray-300 hidden lg:inline">
                      {member.member_name.split(' ')[0]}
                    </span>
                  </div>
                ))}
                {members.length > 5 && (
                  <span className="text-xs text-gray-500 px-1.5">
                    +{members.length - 5}
                  </span>
                )}
              </div>
            )}

            {/* Sync Data Button */}
            <button
              onClick={handleSync}
              disabled={syncState === 'syncing'}
              className={cn(
                'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-all duration-200',
                syncState === 'idle' &&
                  'bg-indigo-600/20 border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/30 hover:border-indigo-500/50',
                syncState === 'syncing' &&
                  'bg-gray-800/60 border-gray-700 text-gray-400 cursor-not-allowed',
                syncState === 'success' &&
                  'bg-emerald-600/20 border-emerald-500/30 text-emerald-300',
                syncState === 'error' &&
                  'bg-red-600/20 border-red-500/30 text-red-300'
              )}
              title="Sync data from Excel file"
            >
              {syncState === 'idle' && (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync Data</span>
                </>
              )}
              {syncState === 'syncing' && (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Syncing…</span>
                </>
              )}
              {syncState === 'success' && (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{syncMessage}</span>
                </>
              )}
              {syncState === 'error' && (
                <>
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Failed</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
