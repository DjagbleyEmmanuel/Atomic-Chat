export const THREAD_SCROLL_BEHAVIOR = {
  // FLOW: "chatgpt" behavior (keep viewport anchored to the latest user message)
  FLOW: 'flow',
  // STICKY: auto-follow streaming replies instantly (jumpy as tokens resolve)
  STICKY: 'sticky',
  // SMOOTH: auto-follow streaming replies with a smooth glide
  SMOOTH: 'smooth',
} as const

export type ThreadScrollBehavior =
  (typeof THREAD_SCROLL_BEHAVIOR)[keyof typeof THREAD_SCROLL_BEHAVIOR]

export const DEFAULT_THREAD_SCROLL_BEHAVIOR =
  THREAD_SCROLL_BEHAVIOR.SMOOTH

export const threadScrollBehaviorOptions: Array<{
  value: ThreadScrollBehavior
  translationKey: string
}> = [
  {
    value: THREAD_SCROLL_BEHAVIOR.FLOW,
    translationKey: 'settings:interface.threadScrollFlowTitle',
  },
  {
    value: THREAD_SCROLL_BEHAVIOR.STICKY,
    translationKey: 'settings:interface.threadScrollStickyTitle',
  },
  {
    value: THREAD_SCROLL_BEHAVIOR.SMOOTH,
    translationKey: 'settings:interface.threadScrollSmoothTitle',
  },
]

export const isThreadScrollBehavior = (
  value: unknown
): value is ThreadScrollBehavior =>
  value === THREAD_SCROLL_BEHAVIOR.FLOW ||
  value === THREAD_SCROLL_BEHAVIOR.STICKY ||
  value === THREAD_SCROLL_BEHAVIOR.SMOOTH