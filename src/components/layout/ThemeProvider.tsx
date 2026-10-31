import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { readTheme, resolveTheme, THEME_KEY, type ThemeMode } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Moon, Sun, Monitor } from 'lucide-react';

const ThemeContext = createContext<{ mode: ThemeMode; setMode: (mode: ThemeMode) => void }>({ mode: 'dark', setMode: () => {} });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');
  useEffect(() => setMode(readTheme()), []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = resolveTheme(mode, media.matches);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document.documentElement.classList.toggle('light', resolved === 'light');
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);
  const change = (value: ThemeMode) => {
    try { localStorage.setItem(THEME_KEY, value); } catch { /* session-only theme */ }
    setMode(value);
  };
  return <ThemeContext.Provider value={{ mode, setMode: change }}>{children}</ThemeContext.Provider>;
}
export function ThemePicker() {
  const { mode, setMode } = useContext(ThemeContext);
  return <div className="grid grid-cols-3 gap-2" role="group" aria-label="Appearance">
    {([{ value: 'dark', label: 'Dark', icon: Moon }, { value: 'light', label: 'Light', icon: Sun }, { value: 'system', label: 'System', icon: Monitor }] as const).map(({ value, label, icon: Icon }) =>
      <Button key={value} variant={mode === value ? 'secondary' : 'ghost'} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon className="h-4 w-4" />{label}</Button>)}
  </div>;
}
export function ThemeToggle() {
  const { mode, setMode } = useContext(ThemeContext);
  return <Button variant="ghost" size="icon" aria-label={mode === 'light' ? 'Use dark appearance' : 'Use light appearance'} title="Change appearance" onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}>
    {mode === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
  </Button>;
}