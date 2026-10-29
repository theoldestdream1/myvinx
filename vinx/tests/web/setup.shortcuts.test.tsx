// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
const invoke = vi.fn(async () => ({ data: { token: 'mm_secret_token_123' }, error: null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: any[]) => (invoke as any)(...a) } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import SetupShortcuts, { CAPTURE_URL } from '@/pages/SetupShortcuts';
afterEach(cleanup);
const mount = () => render(<MemoryRouter><SetupShortcuts /></MemoryRouter>);
const openTab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0 });

describe('Quick capture setup guide', () => {
  it('shows the address immediately and creates a key on request, shown once', async () => {
    mount();
    expect(screen.getAllByText(CAPTURE_URL).length).toBeGreaterThan(0);
    expect(screen.queryByText('mm_secret_token_123')).toBeNull();
    fireEvent.click(screen.getByText('Create my key'));
    await waitFor(() => expect(screen.getAllByText('mm_secret_token_123').length).toBeGreaterThan(0));
    expect(invoke).toHaveBeenCalledWith('generate-device-token', expect.anything());
    expect(screen.queryByText('Create my key')).toBeNull();
  });

  it('puts the real key into the copy-paste examples once it exists', async () => {
    mount();
    expect(document.body.textContent).toContain('Bearer YOUR_KEY');
    fireEvent.click(screen.getByText('Create my key'));
    await waitFor(() => expect(document.body.textContent).toContain('Bearer mm_secret_token_123'));
  });

  it('gives the exact Siri phrase and the Back Tap path', async () => {
    mount(); openTab(/iPhone/); await screen.findByText(/Dictate Text/);
    const t = document.body.textContent!;
    expect(t).toContain('Hey Siri, Tell V');
    expect(t).toContain('Back Tap');
    expect(t).toContain('Take Screenshot');
    expect(t).toContain('Show in Share Sheet');
  });

  it('is honest about the limits (one-breath Siri phrases, Google custom phrases, EU push)', async () => {
    mount(); openTab(/iPhone/); await screen.findByText(/Dictate Text/);
    let t = document.body.textContent!;
    expect(t).toMatch(/can't take the whole sentence in one breath/);
    expect(t).toMatch(/EU/);
    openTab(/Android/); await screen.findByText(/Install once/);
    t = document.body.textContent!;
    expect(t).toMatch(/doesn't currently let apps register/);
  });

  it('does not show "Add to Shortcuts" buttons until real links are configured', async () => {
    mount(); openTab(/iPhone/); await screen.findByText(/Dictate Text/);
    expect(screen.queryByText(/Add “Tell V” to Shortcuts/)).toBeNull();
  });
});
