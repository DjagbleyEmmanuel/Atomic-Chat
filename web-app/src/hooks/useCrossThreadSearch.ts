import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ContentType, ThreadMessage } from '@janhq/core'
import { useThreads } from '@/hooks/useThreads'
import { useMessages } from '@/hooks/useMessages'
import { getServiceHub } from '@/hooks/useServiceHub'
import { TEMPORARY_CHAT_ID } from '@/constants/chat'

export type CrossThreadSearchMatch = {
  threadId: string
  threadTitle: string
  messageId: string
  role: string
  snippet: string
}

const DEBOUNCE_MS = 250
const MAX_MATCHES_PER_THREAD = 3
const MAX_TOTAL_MATCHES = 30

const messageText = (message: ThreadMessage): string =>
  message.content
    .filter((content) => content.type === ContentType.Text)
    .map((content) => content.text?.value ?? '')
    .join('\n')

// Build a stable match list from the messages currently held in the store.
const matchesFromMessages = (
  threads: Record<string, Thread>,
  messagesByThread: Record<string, ThreadMessage[]>,
  query: string
): CrossThreadSearchMatch[] => {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const matches: CrossThreadSearchMatch[] = []
  for (const threadId of Object.keys(messagesByThread)) {
    if (threadId === TEMPORARY_CHAT_ID) continue
    const thread = threads[threadId]
    const threadTitle = thread?.title ?? 'Untitled'
    let perThread = 0
    for (const message of messagesByThread[threadId] ?? []) {
      if (message.role === 'system') continue
      const text = messageText(message)
      if (!text) continue
      const lower = text.toLowerCase()
      if (!lower.includes(needle)) continue

      const index = lower.indexOf(needle)
      const start = Math.max(0, index - 40)
      const snippet = (start > 0 ? '…' : '') + text.slice(start, index + 80)
      matches.push({
        threadId,
        threadTitle,
        messageId: message.id,
        role: message.role,
        snippet,
      })
      perThread += 1
      if (perThread >= MAX_MATCHES_PER_THREAD) break
      if (matches.length >= MAX_TOTAL_MATCHES) return matches
    }
  }
  return matches
}

export function useCrossThreadSearch() {
  const threads = useThreads((state) => state.threads)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce the query so we don't re-index on every keystroke.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  // Lazy-load messages for every thread into the shared message store so the
  // cross-thread index can search them. Only loads threads that aren't cached
  // yet; the store already holds messages for opened/listed threads.
  useEffect(() => {
    if (!debouncedQuery.trim()) return

    const serviceHub = getServiceHub()
    const missing = Object.keys(threads).filter(
      (id) =>
        id !== TEMPORARY_CHAT_ID &&
        (useMessages.getState().messages[id] ?? []).length === 0
    )

    Promise.all(
      missing.map((id) =>
        serviceHub
          .messages()
          .fetchMessages(id)
          .then((fetched) => {
            if (fetched && fetched.length > 0) {
              useMessages.getState().setMessages(id, fetched)
            }
          })
          .catch(() => {
            // Ignore per-thread load failures; the thread simply won't match.
          })
      )
    )
  }, [debouncedQuery, threads])

  // Re-run the match computation whenever messages or the debounced query change.
  // We subscribe to the store directly to get fresh message contents.
  const messages = useMessages((state) => state.messages)

  const matches = useMemo(
    () => matchesFromMessages(threads, messages, debouncedQuery),
    [threads, messages, debouncedQuery]
  )

  const setSearchQuery = useCallback((value: string) => setQuery(value), [])
  const clear = useCallback(() => {
    setQuery('')
    setDebouncedQuery('')
  }, [])

  return { matches, query, setSearchQuery, clear }
}
