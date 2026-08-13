import { create } from 'zustand'

const DRAFTS_STORAGE_KEY = 'atomic-chat.prompt-drafts.v1'

function loadDrafts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // Ignore malformed or unavailable storage
  }
  return {}
}

function persistDrafts(drafts: Record<string, string>) {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
  } catch {
    // Ignore quota / availability errors
  }
}

type PromptStoreState = {
  prompt: string
  drafts: Record<string, string>
  activeThreadId: string | undefined
  setPrompt: (value: string) => void
  resetPrompt: () => void
  setActiveThread: (threadId: string | undefined) => void
  clearDraft: (threadId: string) => void
}

export const usePrompt = create<PromptStoreState>((set, get) => ({
  prompt: '',
  drafts: loadDrafts(),
  activeThreadId: undefined,
  setPrompt: (value) => {
    const { activeThreadId, drafts } = get()
    if (!activeThreadId) {
      set({ prompt: value })
      return
    }
    const nextDrafts = { ...drafts, [activeThreadId]: value }
    persistDrafts(nextDrafts)
    set({ prompt: value, drafts: nextDrafts })
  },
  resetPrompt: () => {
    const { activeThreadId, drafts } = get()
    if (!activeThreadId) {
      set({ prompt: '' })
      return
    }
    const nextDrafts = { ...drafts }
    delete nextDrafts[activeThreadId]
    persistDrafts(nextDrafts)
    set({ prompt: '', drafts: nextDrafts })
  },
  setActiveThread: (threadId) => {
    const { activeThreadId, drafts } = get()
    if (activeThreadId === threadId) return
    set({
      prompt: threadId ? drafts[threadId] ?? '' : '',
      activeThreadId: threadId,
    })
  },
  clearDraft: (threadId) => {
    const { drafts } = get()
    if (!(threadId in drafts)) return
    const nextDrafts = { ...drafts }
    delete nextDrafts[threadId]
    persistDrafts(nextDrafts)
    set({ drafts: nextDrafts })
  },
}))
