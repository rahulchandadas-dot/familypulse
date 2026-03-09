'use client'

/**
 * ChatInterface
 * Full-featured slide-in chat panel for family health Q&A.
 * Grounded in approved medical sources, with citation display and disclaimers.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  BookOpen,
  Users,
} from 'lucide-react'
import { cn, getMemberColor, getMemberInitials, formatDate } from '@/lib/utils'
import type { ChatMessage, FamilyMember, Citation } from '@/types'

interface ChatInterfaceProps {
  isOpen: boolean
  onClose: () => void
  familyId: string
  members: FamilyMember[]
  sessionId: string | undefined
  onSessionCreated: (sessionId: string) => void
}

// ============================================================
// CITATION DISPLAY
// ============================================================

function CitationList({ citations }: { citations: Citation[] }) {
  const [expanded, setExpanded] = useState(false)
  if (citations.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
      >
        <BookOpen className="w-3 h-3" />
        <span>{citations.length} source{citations.length > 1 ? 's' : ''}</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {citations.map((citation, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-2 rounded-lg bg-gray-800/60 border border-gray-700/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-gray-300 leading-tight">
                  {citation.title}
                </p>
                <p className="text-[9px] text-gray-500 mt-0.5">{citation.source_org}</p>
                {citation.excerpt && (
                  <p className="text-[9px] text-gray-600 mt-1 leading-relaxed line-clamp-2">
                    {citation.excerpt}
                  </p>
                )}
              </div>
              {citation.url && (
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition-colors"
                  aria-label="Open source"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// TYPING INDICATOR
// ============================================================

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-[10px] font-bold">FP</span>
      </div>
      <div className="chat-bubble-assistant inline-flex items-center gap-1.5 py-3">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  )
}

// ============================================================
// MESSAGE BUBBLE
// ============================================================

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="chat-bubble-user">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  // Render assistant message with markdown-like formatting
  const renderContent = (text: string) => {
    // Simple markdown: bold, italic, bullet points, inline code
    const lines = text.split('\n')
    return lines.map((line, idx) => {
      const trimmed = line.trim()

      // Horizontal rule
      if (trimmed === '---' || trimmed === '***') {
        return <hr key={idx} className="border-gray-700 my-2" />
      }

      // Bullet point
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        const content = trimmed.replace(/^[-•]\s/, '')
        return (
          <li key={idx} className="text-sm text-gray-200 leading-relaxed ml-4 list-disc">
            {renderInline(content)}
          </li>
        )
      }

      // Numbered list
      if (/^\d+\.\s/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s/, '')
        return (
          <li key={idx} className="text-sm text-gray-200 leading-relaxed ml-4 list-decimal">
            {renderInline(content)}
          </li>
        )
      }

      // Heading
      if (trimmed.startsWith('### ')) {
        return (
          <h4 key={idx} className="text-sm font-semibold text-gray-100 mt-3 mb-1">
            {trimmed.replace('### ', '')}
          </h4>
        )
      }
      if (trimmed.startsWith('## ')) {
        return (
          <h3 key={idx} className="text-base font-semibold text-gray-50 mt-3 mb-1.5">
            {trimmed.replace('## ', '')}
          </h3>
        )
      }

      // Empty line
      if (trimmed === '') {
        return <br key={idx} />
      }

      return (
        <p key={idx} className="text-sm text-gray-200 leading-relaxed">
          {renderInline(line)}
        </p>
      )
    })
  }

  const renderInline = (text: string): React.ReactNode => {
    // Bold: **text**
    const boldSplit = text.split(/\*\*([^*]+)\*\*/)
    if (boldSplit.length > 1) {
      return boldSplit.map((part, i) =>
        i % 2 === 0 ? part : <strong key={i} className="font-semibold text-gray-100">{part}</strong>
      )
    }
    // Italic: _text_
    const italicSplit = text.split(/_([^_]+)_/)
    if (italicSplit.length > 1) {
      return italicSplit.map((part, i) =>
        i % 2 === 0 ? part : <em key={i} className="italic text-gray-300">{part}</em>
      )
    }
    return text
  }

  return (
    <div className="flex items-end gap-2">
      {/* Assistant avatar */}
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0 mb-0.5">
        <span className="text-white text-[10px] font-bold">FP</span>
      </div>
      <div className="chat-bubble-assistant max-w-[85%]">
        <div className="space-y-1">
          {renderContent(message.content)}
        </div>
        {message.citations && message.citations.length > 0 && (
          <CitationList citations={message.citations} />
        )}
        <p className="text-[9px] text-gray-600 mt-2">
          {formatDate(message.created_at, 'h:mm a')}
        </p>
      </div>
    </div>
  )
}

// ============================================================
// SUGGESTED PROMPTS
// ============================================================

const SUGGESTED_PROMPTS = [
  'How can our family improve sleep quality together?',
  'What does low HRV mean and how do we improve it?',
  'Tips for reducing family stress as a household?',
  'How many steps should each family member aim for?',
  'What activities can we do together to stay active?',
]

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ChatInterface({
  isOpen,
  onClose,
  familyId,
  members,
  sessionId,
  onSessionCreated,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (messages.length > 0) scrollToBottom()
  }, [messages, scrollToBottom])

  // Load existing messages when session opens
  useEffect(() => {
    if (isOpen && sessionId) {
      fetch(`/api/chat?session_id=${sessionId}`)
        .then(r => r.json())
        .then((result: { success: boolean; data?: { messages?: ChatMessage[] } }) => {
          if (result.success && result.data?.messages) {
            setMessages(result.data.messages)
          }
        })
        .catch(() => {})
    }
  }, [isOpen, sessionId])

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Handle send
  const handleSend = async (messageText?: string) => {
    const text = (messageText ?? inputValue).trim()
    if (!text || isLoading) return

    setInputValue('')
    setError(null)

    // Optimistically add user message
    const optimisticUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      session_id: sessionId ?? '',
      role: 'user',
      content: text,
      citations: [],
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimisticUserMsg])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          familyId,
        }),
      })

      const result = await response.json() as {
        success: boolean
        data?: {
          sessionId?: string
          message?: ChatMessage
        }
        error?: string
      }

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to get response')
      }

      // Set session ID if new
      if (result.data.sessionId && !sessionId) {
        onSessionCreated(result.data.sessionId)
      }

      // Add assistant response
      if (result.data.message) {
        setMessages(prev => [...prev, result.data!.message!])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(msg)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m.id !== optimisticUserMsg.id))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 w-full md:w-[440px]',
          'flex flex-col bg-gray-950 border-l border-gray-800',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Family health chat"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">FP</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-100">Family Health Assistant</p>
              <p className="text-[10px] text-gray-500">
                Powered by Claude · Grounded in CDC, NIH, and more
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Disclaimer banner */}
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/20 border-b border-amber-800/20 flex-shrink-0">
          <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
          <p className="text-[10px] text-amber-600/80 leading-tight">
            Educational only. Not a substitute for medical care. Always consult a healthcare provider.
          </p>
        </div>

        {/* Family context bar */}
        {members.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/60 border-b border-gray-800/50 flex-shrink-0">
            <Users className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <p className="text-[10px] text-gray-500 mr-1">Tracking:</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {members.map(member => (
                <span
                  key={member.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium"
                  style={{
                    backgroundColor: getMemberColor(member.id) + '20',
                    color: getMemberColor(member.id),
                    border: `1px solid ${getMemberColor(member.id)}40`,
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                    style={{ backgroundColor: getMemberColor(member.id) }}
                  >
                    {getMemberInitials(member.member_name)[0]}
                  </span>
                  {member.member_name.split(' ')[0]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Welcome message */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center">
                <span className="text-2xl">💬</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-200 mb-1">
                  Ask about your family's health
                </p>
                <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  I can help explain health metrics, suggest family-friendly wellness strategies,
                  and answer questions — all grounded in approved medical sources.
                </p>
              </div>

              {/* Suggested prompts */}
              <div className="w-full space-y-2 mt-2">
                {SUGGESTED_PROMPTS.slice(0, 4).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs text-gray-400 bg-gray-900 border border-gray-800 hover:border-gray-700 hover:text-gray-300 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.map(message => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {/* Typing indicator */}
          {isLoading && <TypingIndicator />}

          {/* Error state */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/30 border border-red-800/30">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-800 px-4 py-3 flex-shrink-0 bg-gray-950/90 backdrop-blur-sm">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your family's health…"
                rows={1}
                className={cn(
                  'w-full resize-none rounded-xl px-3.5 py-2.5 text-sm',
                  'bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-600',
                  'focus:outline-none focus:border-indigo-500/60 focus:bg-gray-800',
                  'transition-colors leading-relaxed',
                  'min-h-[42px] max-h-32 overflow-y-auto'
                )}
                style={{
                  height: 'auto',
                  minHeight: '42px',
                }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                }}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className={cn(
                'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all',
                inputValue.trim() && !isLoading
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              )}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-700 mt-2 text-center">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </>
  )
}
