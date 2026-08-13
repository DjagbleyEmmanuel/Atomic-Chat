import { create } from 'zustand'

export type ReplyTarget = {
  messageId: string
  role: 'user' | 'assistant'
  snippet: string
}

type ReplyToStore = {
  byThread: Record<string, ReplyTarget | null>
  set: (threadId: string, target: ReplyTarget) => void
  clear: (threadId: string) => void
}

/**
 * Per-thread "replying to" target shared between MessageItem (sets it) and
 * ChatInput (renders the banner + embeds the quote into the sent message).
 * Keyed by thread so navigating threads never leaks the previous quote.
 */
export const useReplyTo = create<ReplyToStore>()((set) => ({
  byThread: {},
  set: (threadId, target) =>
    set((state) => ({ byThread: { ...state.byThread, [threadId]: target } })),
  clear: (threadId) =>
    set((state) => ({ byThread: { ...state.byThread, [threadId]: null } })),
}))
