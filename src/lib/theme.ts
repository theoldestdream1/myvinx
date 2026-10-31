export type ThemeMode = 'dark' | 'light' | 'system';
export const THEME_KEY = 'vinx.theme.v1';
export function readTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch { return 'dark'; }
}
export function resolveTheme(mode: ThemeMode, systemDark: boolean): 'dark' | 'light' {
  return mode === 'system' ? systemDark ? 'dark' : 'light' : mode;
}