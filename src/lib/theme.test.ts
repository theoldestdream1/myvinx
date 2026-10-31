import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';
describe('appearance resolution', () => {
  it('keeps light mode even on a dark device', () => expect(resolveTheme('light', true)).toBe('light'));
  it('keeps dark mode even on a light device', () => expect(resolveTheme('dark', false)).toBe('dark'));
  it('follows the device in system mode', () => { expect(resolveTheme('system', true)).toBe('dark'); expect(resolveTheme('system', false)).toBe('light'); });
});