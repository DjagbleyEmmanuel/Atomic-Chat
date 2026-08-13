/**
 * Theme Service Types
 */

export type ThemeMode =
  | 'light'
  | 'dark'
  | 'midnight'
  | 'midnight-red'
  | 'midnight-emerald'
  | 'midnight-violet'
  | null

/**
 * Deep dark themes that layer on top of the `.dark` palette via their own
 * accent-hued CSS variable block (like `midnight`). Each applies `.dark`
 * plus its own class to the root element.
 */
export const DARK_VARIANT_THEMES: readonly Exclude<ThemeMode, 'light' | 'dark' | null>[] =
  ['midnight', 'midnight-red', 'midnight-emerald', 'midnight-violet'] as const

export const isDarkVariantTheme = (
  theme: ThemeMode | string | null | undefined
): theme is (typeof DARK_VARIANT_THEMES)[number] =>
  typeof theme === 'string' &&
  (DARK_VARIANT_THEMES as readonly string[]).includes(theme)

export interface ThemeService {
  setTheme(theme: ThemeMode): Promise<void>
  getCurrentWindow(): { setTheme: (theme: ThemeMode) => Promise<void> }
}
