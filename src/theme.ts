import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import type { ThemeMode } from '@/domain/models'

const THEME_STORAGE_KEY = 'quiz-app-theme-mode'
const DARK_QUERY = '(prefers-color-scheme: dark)'

let activeMediaQuery: MediaQueryList | null = null
let activeMediaListener: ((event: MediaQueryListEvent) => void) | null = null

export function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'LIGHT' || value === 'DARK' || value === 'SYSTEM' ? value : 'SYSTEM'
}

export function readCachedThemeMode(): ThemeMode {
  try {
    return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'SYSTEM'
  }
}

export function resolveThemeMode(mode: ThemeMode, systemIsDark: boolean): 'light' | 'dark' {
  if (mode === 'DARK') return 'dark'
  if (mode === 'LIGHT') return 'light'
  return systemIsDark ? 'dark' : 'light'
}

export function applyThemeMode(value: ThemeMode): void {
  const mode = normalizeThemeMode(value)
  try { localStorage.setItem(THEME_STORAGE_KEY, mode) } catch { /* SQLite remains authoritative. */ }
  removeSystemListener()

  const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  const applyResolved = (systemIsDark: boolean) => applyResolvedTheme(resolveThemeMode(mode, systemIsDark))
  applyResolved(Boolean(mediaQuery?.matches))

  if (mode === 'SYSTEM' && mediaQuery) {
    activeMediaQuery = mediaQuery
    activeMediaListener = (event) => applyResolved(event.matches)
    mediaQuery.addEventListener?.('change', activeMediaListener)
    if (!mediaQuery.addEventListener) mediaQuery.addListener(activeMediaListener)
  }
}

function removeSystemListener(): void {
  if (!activeMediaQuery || !activeMediaListener) return
  activeMediaQuery.removeEventListener?.('change', activeMediaListener)
  if (!activeMediaQuery.removeEventListener) activeMediaQuery.removeListener(activeMediaListener)
  activeMediaQuery = null
  activeMediaListener = null
}

function applyResolvedTheme(theme: 'light' | 'dark'): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#151B18' : '#F7F5EF')
  void updateNativeStatusBar(theme)
}

async function updateNativeStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const dark = theme === 'dark'
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light })
    await StatusBar.setBackgroundColor({ color: dark ? '#151B18' : '#F7F5EF' })
  } catch {
    // Android 15+ manages the transparent system-bar background; icon style still follows the call above.
  }
}
