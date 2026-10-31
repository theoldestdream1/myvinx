import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'owner' } as { id: string } | null, navigate: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock('@/lib/router-compat', () => ({ useNavigate: () => state.navigate, useLocation: () => ({ pathname: '/dashboard' }) }));
import { VTour } from './VTour';
import { startTour, tourKey, tourSeen } from '@/lib/v/tour';
beforeEach(() => { localStorage.clear(); state.user = { id: 'owner' }; state.navigate.mockClear(); });
afterEach(cleanup);
describe('V-led tour lifecycle', () => {
  it('starts automatically for a new user and visits all six screens', () => {
    render(<VTour />);
    expect(state.navigate).toHaveBeenLastCalledWith('/dashboard');
    for (const path of ['/capture', '/timeline', '/intents', '/query', '/settings']) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(state.navigate).toHaveBeenLastCalledWith(path);
    }
    fireEvent.click(screen.getByRole('button', { name: 'All settled' }));
    expect(tourSeen('owner')).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('allows skipping and replay without repeatedly forcing the tour', () => {
    const view = render(<VTour />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Skip tour' })[0]);
    expect(tourSeen('owner')).toBe(true);
    view.unmount(); render(<VTour />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(startTour);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('does not carry completion across users', () => {
    localStorage.setItem(tourKey('another-owner'), 'done');
    render(<VTour />); expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('does not start signed out', () => {
    state.user = null; render(<VTour />); expect(state.navigate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});