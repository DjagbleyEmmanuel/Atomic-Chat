import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { localStorageKey } from '@/constants/localStorage'
import {
  DEFAULT_THREAD_SCROLL_BEHAVIOR,
  isThreadScrollBehavior,
  type ThreadScrollBehavior,
} from '@/constants/threadScroll'
import { useTheme } from './useTheme'

export type FontSize = '14px' | '15px' | '16px' | '18px' | '20px'

export type MessageDisplayMode = 'markdown' | 'plain' | 'monospace'

export type ChatBackground =
  | 'default'
  | 'dusk'
  | 'forest'
  | 'midnight'
  | 'ocean'
  | 'sakura'

export const CHAT_BACKGROUNDS: ReadonlyArray<{
  value: ChatBackground
  label: string
  css: string
}> = [
  {
    value: 'default',
    label: 'Default',
    css: '',
  },
  {
    value: 'dusk',
    label: 'Dusk',
    css: 'linear-gradient(180deg, #2b2a4a 0%, #1d1b3a 55%, #14121f 100%)',
  },
  {
    value: 'forest',
    label: 'Forest',
    css: 'linear-gradient(180deg, #12343b 0%, #1d3b2a 60%, #0f1f16 100%)',
  },
  {
    value: 'midnight',
    label: 'Midnight',
    css: 'linear-gradient(180deg, #10131f 0%, #0b0e1a 60%, #060810 100%)',
  },
  {
    value: 'ocean',
    label: 'Ocean',
    css: 'linear-gradient(180deg, #0d3a4d 0%, #123a56 55%, #0a1e2d 100%)',
  },
  {
    value: 'sakura',
    label: 'Sakura',
    css: 'linear-gradient(180deg, #3a2436 0%, #4a2738 55%, #231018 100%)',
  },
]

const DEFAULT_CHAT_BACKGROUND: ChatBackground = 'default'

//* Единственный пресет: нейтральный сайдбар без фиолетового/брендового акцента (--primary из index.css)
const ACCENT_THUMB = '#737373'
export const ACCENT_COLORS = [
  {
    name: 'Primary',
    value: 'primary',
    thumb: ACCENT_THUMB,
    sidebar: { light: '#f5f5f5', dark: '#2c2c2c' },
  },
] as const

export type AccentColorValue = (typeof ACCENT_COLORS)[number]['value']
const DEFAULT_ACCENT_COLOR: AccentColorValue = 'primary'

const applyAccentColorToDOM = (colorValue: string, isDark: boolean) => {
  const color = ACCENT_COLORS.find((c) => c.value === colorValue)
  if (!color) return

  const root = document.documentElement
  const sidebarColor = isDark ? color.sidebar.dark : color.sidebar.light

  root.style.setProperty('--sidebar', sidebarColor)
}

interface InterfaceSettingsState {
  fontSize: FontSize
  accentColor: AccentColorValue
  chatBackground: ChatBackground
  chatWallpaper: string | null
  threadScroll: ThreadScrollBehavior
  messageDisplayMode: MessageDisplayMode
  setFontSize: (size: FontSize) => void
  setAccentColor: (color: AccentColorValue) => void
  setChatBackground: (background: ChatBackground) => void
  setChatWallpaper: (url: string | null) => void
  setThreadScroll: (behavior: ThreadScrollBehavior) => void
  setMessageDisplayMode: (mode: MessageDisplayMode) => void
  resetInterface: () => void
}

type InterfaceSettingsPersistedSlice = Omit<
  InterfaceSettingsState,
  | 'resetInterface'
  | 'setFontSize'
  | 'setAccentColor'
  | 'setChatBackground'
  | 'setChatWallpaper'
  | 'setThreadScroll'
  | 'setMessageDisplayMode'
>

export const fontSizeOptions = [
  { label: 'Small', value: '14px' as FontSize },
  { label: 'Medium', value: '16px' as FontSize },
  { label: 'Large', value: '18px' as FontSize },
  { label: 'Extra Large', value: '20px' as FontSize },
]

// Default interface settings
const defaultFontSize: FontSize = '16px'

const createDefaultInterfaceValues = (): InterfaceSettingsPersistedSlice => {
  return {
    fontSize: defaultFontSize,
    accentColor: DEFAULT_ACCENT_COLOR,
    chatBackground: DEFAULT_CHAT_BACKGROUND,
    chatWallpaper: null,
    threadScroll: DEFAULT_THREAD_SCROLL_BEHAVIOR,
    messageDisplayMode: 'markdown',
  }
}

const interfaceStorage = createJSONStorage<InterfaceSettingsState>(() => ({
  getItem: (name) => localStorage.getItem(name),
  // A custom wallpaper is persisted as a base64 data URL; guard the write so
  // a quota overflow (large images) degrades to "wallpaper not remembered"
  // instead of throwing inside the zustand persist pipeline.
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Storage full / unavailable - ignore, state stays in memory.
    }
  },
  removeItem: (name) => localStorage.removeItem(name),
}))

export const useInterfaceSettings = create<InterfaceSettingsState>()(
  persist(
    (set) => {
      const defaultState = createDefaultInterfaceValues()
      return {
        ...defaultState,
        resetInterface: () => {
          const { isDark } = useTheme.getState()

          // Reset font size
          document.documentElement.style.setProperty(
            '--font-size-base',
            defaultFontSize
          )

          // Reset accent color preset
          applyAccentColorToDOM(DEFAULT_ACCENT_COLOR, isDark)

          // Update state
          set({
            fontSize: defaultFontSize,
            accentColor: DEFAULT_ACCENT_COLOR,
            chatBackground: DEFAULT_CHAT_BACKGROUND,
            chatWallpaper: null,
            threadScroll: DEFAULT_THREAD_SCROLL_BEHAVIOR,
            messageDisplayMode: 'markdown',
          })
        },

        setChatBackground: (background: ChatBackground) => {
          const exists = CHAT_BACKGROUNDS.some((b) => b.value === background)
          if (!exists) return
          set({ chatBackground: background })
        },

        setChatWallpaper: (url: string | null) => {
          set({ chatWallpaper: url })
        },

        setAccentColor: (color: AccentColorValue) => {
          const colorExists = ACCENT_COLORS.find((c) => c.value === color)
          if (!colorExists) return

          const { isDark } = useTheme.getState()
          applyAccentColorToDOM(color, isDark)
          set({ accentColor: color })
        },

        setFontSize: (size: FontSize) => {
          // Update CSS variable
          document.documentElement.style.setProperty('--font-size-base', size)
          // Update state
          set({ fontSize: size })
        },

        setThreadScroll: (behavior: ThreadScrollBehavior) => {
          if (!isThreadScrollBehavior(behavior)) return
          set({ threadScroll: behavior })
        },

        setMessageDisplayMode: (mode: MessageDisplayMode) => {
          set({ messageDisplayMode: mode })
        },
      }
    },
    {
      name: localStorageKey.settingInterface,
      storage: interfaceStorage,
      // Apply settings when hydrating from storage
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migrate old font size value '15px' to '16px'
          if ((state.fontSize as FontSize) === '15px') {
            state.fontSize = '16px'
          }

          // Migrate accent: если сохранённый пресет больше не существует — применить единственный
          const colorExists = ACCENT_COLORS.some((c) => c.value === state.accentColor)
          if (!colorExists) {
            state.accentColor = DEFAULT_ACCENT_COLOR
          }

          // Migrate chat background: fall back to default if the saved preset is gone
          const backgroundExists = CHAT_BACKGROUNDS.some(
            (b) => b.value === state.chatBackground
          )
          if (!backgroundExists) {
            state.chatBackground = DEFAULT_CHAT_BACKGROUND
          }

          // Migrate wallpaper: treat missing/invalid value as unset
          if (
            state.chatWallpaper != null &&
            typeof state.chatWallpaper !== 'string'
          ) {
            state.chatWallpaper = null
          }

          // Migrate thread scroll: fall back to the default if the saved value
          // is unknown (or missing on state saved before the setting existed)
          if (!isThreadScrollBehavior(state.threadScroll)) {
            state.threadScroll = DEFAULT_THREAD_SCROLL_BEHAVIOR
          }

          // Migrate message display mode: fall back to markdown when missing
          if (
            state.messageDisplayMode !== 'plain' &&
            state.messageDisplayMode !== 'monospace'
          ) {
            state.messageDisplayMode = 'markdown'
          }

          // Apply font size from storage
          document.documentElement.style.setProperty(
            '--font-size-base',
            state.fontSize
          )

          const { isDark } = useTheme.getState()
          const accentColorValue = state.accentColor || DEFAULT_ACCENT_COLOR
          applyAccentColorToDOM(accentColorValue, isDark)
        }

        return state
      },
    }
  )
)

// Subscribe to theme changes to update accent color sidebar variant
let prevIsDark = useTheme.getState().isDark
useTheme.subscribe((state) => {
  if (state.isDark !== prevIsDark) {
    prevIsDark = state.isDark
    const { accentColor } = useInterfaceSettings.getState()
    applyAccentColorToDOM(accentColor, state.isDark)
  }
})
