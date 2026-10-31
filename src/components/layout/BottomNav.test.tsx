import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/router-compat', () => ({
  useLocation: () => ({ pathname: '/dashboard' }),
  NavLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a>,
}));
import { BottomNav } from './BottomNav';
afterEach(cleanup);
describe('mobile destination access', () => {
  it('exposes reminders directly and pricing, Ask, graph and shortcuts in More', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Reminders' })).toHaveAttribute('href', '/intents');
    fireEvent.click(screen.getByRole('button', { name: 'More pages' }));
    for (const [name, path] of [['Plans & pricing', '/pricing'], ['Ask V', '/query'], ['Knowledge graph', '/graph'], ['Shortcuts', '/setup/shortcuts'], ['Settings', '/settings']]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', path);
    }
    fireEvent.click(screen.getByRole('link', { name: 'Plans & pricing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});