import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, ThemePicker } from './ThemeProvider';
import { THEME_KEY } from '@/lib/theme';
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe('appearance controls', () => {
  it('applies light mode immediately and preserves it after remount', () => {
    const view = render(<ThemeProvider><ThemePicker /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: /^Light$/ }));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    view.unmount(); render(<ThemeProvider><ThemePicker /></ThemeProvider>);
    expect(screen.getByRole('button', { name: /^Light$/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Dark$/ }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});