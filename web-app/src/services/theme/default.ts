/**
 * Default Theme Service - Generic implementation with minimal returns
 */

import {
  DARK_VARIANT_THEMES,
  type ThemeService,
  type ThemeMode,
} from './types'

const ALL_THEME_CLASSES: readonly string[] = [
  'dark',
  ...DARK_VARIANT_THEMES,
]

export class DefaultThemeService implements ThemeService {
  async setTheme(theme: ThemeMode): Promise<void> {
    console.log('setTheme called with theme:', theme)

    const root = document.documentElement
    root.classList.remove(...ALL_THEME_CLASSES)

    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (
      theme &&
      (DARK_VARIANT_THEMES as readonly string[]).includes(theme)
    ) {
      // Dark variants layer on the `dark:` variants, so they co-apply `.dark`.
      root.classList.add('dark', theme)
    }
  }

  getCurrentWindow() {
    return {
      setTheme: (theme: ThemeMode): Promise<void> => {
        console.log('window.setTheme called with theme:', theme)
        return Promise.resolve()
      }
    }
  }
}
