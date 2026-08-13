/**
 * Tauri Theme Service - Desktop implementation
 */

import { Theme } from '@tauri-apps/api/window'
import { getAllWebviewWindows, type WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { ThemeMode } from './types'
import { DefaultThemeService } from './default'

export class TauriThemeService extends DefaultThemeService {
  async setTheme(theme: ThemeMode): Promise<void> {
    try {
      // Manage HTML classes (dark, midnight) via the base service
      await super.setTheme(theme)

      // Map any dark variant to dark for Tauri's Theme API (it has no variants)
      const tauriTheme: Theme | null =
        theme === 'light' ? 'light' : theme == null ? null : 'dark'

      // Update all open windows, not just the current one
      const allWindows = await getAllWebviewWindows()

      // Convert to array if it's not already
      const windowsArray: WebviewWindow[] = Array.isArray(allWindows)
        ? allWindows
        : Object.values(allWindows)

      await Promise.all(
        windowsArray.map(async (window) => {
          try {
            await window.setTheme(tauriTheme)
          } catch (error) {
            console.error(
              `Failed to set theme for window ${window.label}:`,
              error
            )
          }
        })
      )
    } catch (error) {
      console.error('Error setting theme in Tauri:', error)
      throw error
    }
  }

  getCurrentWindow() {
    return {
      setTheme: (theme: ThemeMode): Promise<void> => {
        return this.setTheme(theme)
      },
    }
  }
}
