// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const flags = vi.hoisted(() => ({ ios: true, installed: false }));
vi.mock('@/hooks/useInstallPrompt', () => ({ useInstallPrompt: () => ({ ios: flags.ios, installed: flags.installed, canPromptInstall: false, install: async () => false }) }));
import { IosInstallGuide } from '@/components/dashboard/IosInstallGuide';

beforeEach(() => { flags.ios = true; flags.installed = false; localStorage.clear(); });
afterEach(() => cleanup());

describe('iPhone install guide', () => {
  it('shows the three steps on iPhone when not installed', () => {
    render(<IosInstallGuide />);
    expect(screen.getAllByText(/Add to Home Screen/).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: /Home Screen/ })).toBeTruthy();
  });
  it('is hidden on other devices', () => { flags.ios = false; render(<IosInstallGuide />); expect(screen.queryByRole('region')).toBeNull(); });
  it('is hidden once installed', () => { flags.installed = true; render(<IosInstallGuide />); expect(screen.queryByRole('region')).toBeNull(); });
  it('can be dismissed for good', () => {
    const { unmount } = render(<IosInstallGuide />);
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('region')).toBeNull();
    unmount(); render(<IosInstallGuide />);
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('still works if storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<IosInstallGuide />);
    fireEvent.click(screen.getByText(/I've done it/));
    expect(screen.queryByRole('region')).toBeNull();
    spy.mockRestore();
  });
});
