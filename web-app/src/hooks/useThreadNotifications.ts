import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'

type ThreadNotificationsState = {
  // Single global master switch for desktop notifications on reply completion.
  globallyEnabled: boolean
  setGloballyEnabled: (value: boolean) => void
  // Per-thread opt-out: thread ids that should not fire completion
  // notifications even when the global switch is on.
  mutedThreadIds: string[]
  setThreadMuted: (threadId: string, muted: boolean) => void
  isThreadMuted: (threadId: string) => boolean
}

export const useThreadNotifications = create<ThreadNotificationsState>()(
  persist(
    (set, get) => ({
      globallyEnabled: true,
      setGloballyEnabled: (value: boolean) => {
        set({ globallyEnabled: value })
      },
      mutedThreadIds: [],
      setThreadMuted: (threadId: string, muted: boolean) => {
        set((state) => {
          const next = muted
            ? Array.from(new Set([...state.mutedThreadIds, threadId]))
            : state.mutedThreadIds.filter((id) => id !== threadId)
          return { mutedThreadIds: next }
        })
      },
      isThreadMuted: (threadId: string) =>
        get().mutedThreadIds.includes(threadId),
    }),
    {
      name: localStorageKey.threadNotifications,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        globallyEnabled: state.globallyEnabled,
        mutedThreadIds: state.mutedThreadIds,
      }),
    }
  )
)
