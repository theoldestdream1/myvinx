import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from '@/lib/router-compat';
import { useAuth } from '@/hooks/useAuth';

/** One sign-out path for every button: stop requests, drop cached private data, end the session, leave. */
export function useSignOut() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const run = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await signOut();
      toast.success('Signed out safely. See you soon.');
      navigate('/auth?mode=signin', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };
  return { signOut: run, signingOut };
}
