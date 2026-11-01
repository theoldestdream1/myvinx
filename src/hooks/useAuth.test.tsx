import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const signUpMock = vi.fn();
const signOutMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: () => Promise.resolve({ data: { session: null } }),
      signUp: (...a: unknown[]) => signUpMock(...a),
      signOut: (...a: unknown[]) => signOutMock(...a),
    },
  },
}));

import { AuthProvider, useAuth } from './useAuth';
const wrap = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('sign up', () => {
  beforeEach(() => { signUpMock.mockReset(); signOutMock.mockReset(); });

  it('new account without a session must wait for the confirmation link', async () => {
    signUpMock.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const r = await result.current.signUp(' Ada@Example.com ', 'Abc123!x');
    expect(r).toMatchObject({ needsConfirmation: true, exists: false });
    expect(signUpMock.mock.calls[0][0].email).toBe('ada@example.com');
  });

  it('existing email is reported, not treated as a new account', async () => {
    signUpMock.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect((await result.current.signUp('a@b.co', 'Abc123!x')).exists).toBe(true);
  });

  it('sign out clears the user even if the network call fails', async () => {
    signOutMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAuth(), { wrapper: wrap });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.signOut()).rejects.toThrow();
    expect(result.current.user).toBeNull();
  });
});
