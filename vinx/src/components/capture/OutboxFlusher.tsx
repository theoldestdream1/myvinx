import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { flushQueue, listQueued } from '@/lib/captureQueue';
import { processMemory, saveMemory } from '@/hooks/useCaptureMemory';

/**
 * Sends memories that were saved on this device while offline. Runs when the app opens, when the connection
 * comes back, when the tab becomes visible again, and every minute while something is waiting.
 * Renders nothing.
 */
export function OutboxFlusher() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const run = async () => {
      if (stopped || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
      const { sent } = await flushQueue(user.id, async (item) => {
        const row = await saveMemory(user.id, { content: item.content, source: item.source as never, image: item.image ?? null, imageName: item.imageName, metadata: item.metadata }, item.id);
        void processMemory(row.id);
      });
      if (sent > 0 && !stopped) {
        toast.success(sent === 1 ? 'Sent the memory you saved offline' : `Sent ${sent} memories you saved offline`);
        ['recent-memories', 'dashboard-stats', 'timeline-events'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
    void run();
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(async () => { if ((await listQueued(user.id)).length) void run(); }, 60_000);
    return () => { stopped = true; window.removeEventListener('online', run); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(timer); };
  }, [user, qc]);

  return null;
}
