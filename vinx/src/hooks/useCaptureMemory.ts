import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { vAgent } from '@/lib/avatar/bus';
import { lines } from '@/lib/avatar/scripts';
import type { Database } from '@/integrations/supabase/types';
import { enqueue, isNetworkError } from '@/lib/captureQueue';

export type MemorySource = Database['public']['Enums']['memory_source'];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // matches the storage bucket limit
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic'];

/** Holds a screenshot the user attached (file picker, drag, or paste) plus a preview URL. */
export function useImageAttachment() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const attach = useCallback((f: File | null | undefined) => {
    if (!f) return false;
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
      toast.error('Please attach a PNG, JPG, WebP, GIF or HEIC image');
      return false;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      toast.error('Image is too large (max 10 MB)');
      return false;
    }
    setFile(f);
    return true;
  }, []);

  /** Attach to a textarea's onPaste: pasting a screenshot just works. */
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) {
        e.preventDefault();
        if (attach(f)) toast.success('Screenshot attached');
      }
    },
    [attach],
  );

  const clear = useCallback(() => setFile(null), []);

  return { file, previewUrl, attach, onPaste, clear };
}

export interface CaptureInput {
  content: string;
  source: MemorySource;
  image?: File | Blob | null;
  imageName?: string;
  metadata?: { participants?: string[]; location?: string };
}

/**
 * The one place a memory is written. `clientId` makes it safe to repeat: if a previous attempt already
 * reached the server (but the reply was lost), the existing row is returned instead of a duplicate.
 */
export async function saveMemory(userId: string, { content, source, image, imageName, metadata }: CaptureInput, clientId: string) {
  const { data: existing } = await supabase.from('raw_memories').select('*').eq('user_id', userId).eq('metadata->>client_id', clientId).limit(1);
  if (existing && existing.length) return existing[0];

  let mediaPath: string | null = null;
  if (image) {
    const type = image.type || 'image/png';
    const ext = ((imageName ?? (image as File).name ?? '').split('.').pop() || type.split('/')[1] || 'png').toLowerCase();
    mediaPath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('memory-media').upload(mediaPath, image, { contentType: type, upsert: false });
    if (upErr) throw upErr;
  }

  const { data, error } = await supabase
    .from('raw_memories')
    .insert([
      {
        user_id: userId,
        // raw_content is NOT NULL; a screenshot with no caption gets a placeholder
        raw_content: content.trim() || '[Screenshot]',
        source: image ? 'image' : source,
        media_url: mediaPath,
        status: 'pending' as const,
        platform: 'web',
        capture_type: image ? 'screenshot' : source,
        metadata: { ...(metadata ?? {}), client_id: clientId } as unknown as Record<string, never>,
      },
    ])
    .select()
    .single();

  if (error) {
    if (mediaPath) await supabase.storage.from('memory-media').remove([mediaPath]);
    throw error;
  }
  return data;
}

/** Ask the server to understand a saved memory. Failure is fine: the cron sweeper retries. */
export function processMemory(id: string) {
  return supabase.functions.invoke('process-memory', { body: { memoryId: id } });
}

export interface QueuedResult { queued: true; id: string; media_url: null; source: MemorySource }

/**
 * Saves a memory (text and/or screenshot) and kicks off AI processing.
 * Shared by the dashboard Quick Capture and the full Capture form.
 * With no connection the memory is kept on this device and sent automatically when back online.
 */
export function useCaptureMemory(onCaptured?: () => void, options: { silent?: boolean } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CaptureInput): Promise<Awaited<ReturnType<typeof saveMemory>> | QueuedResult> => {
      if (!user) throw new Error('Not authenticated');
      const clientId = crypto.randomUUID();
      try {
        return await saveMemory(user.id, input, clientId);
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        const kept = await enqueue({ id: clientId, userId: user.id, content: input.content, source: input.source, image: input.image ?? null, imageName: input.imageName ?? (input.image as File | null | undefined)?.name, metadata: input.metadata });
        if (!kept) throw e;
        return { queued: true, id: clientId, media_url: null, source: input.source };
      }
    },
    onSuccess: (data) => {
      if ('queued' in data) {
        if (!options.silent) {
          toast.info("You're offline. Saved on this device, and I'll send it as soon as you're back online.");
          vAgent.say("No signal. I've kept that safe and will save it as soon as we're back online.", 'concerned');
        }
        onCaptured?.();
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['recent-memories'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      if (!options.silent) {
        toast.success(data.media_url ? 'Screenshot saved! Reading it now...' : 'Memory captured! Processing...');
        const l = data.media_url ? lines.savedScreenshot() : data.source === 'voice' ? lines.savedVoice() : lines.savedText();
        vAgent.say(l.text, l.mood);
      }
      onCaptured?.();

      // Process in the background; surface a failure instead of swallowing it
      processMemory(data.id).then(({ error }) => {
        // The server also retries stuck/failed memories automatically; this just tells the person
        if (error && !options.silent) toast.error('Saved, but reading it failed. It will be retried automatically, or tap Retry on your dashboard.');
        if (!error && !options.silent) {
          // if the text contained a reminder, say so once it has been understood
          supabase.from('pending_intents').select('id', { count: 'exact', head: true }).eq('raw_memory_id', data.id)
            .then(({ count }) => { if (count && count > 0) vAgent.say(lines.reminderSet().text, 'happy'); });
        }
        queryClient.invalidateQueries({ queryKey: ['recent-memories'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['timeline-events'] });
        queryClient.invalidateQueries({ queryKey: ['all-intents'] });
        queryClient.invalidateQueries({ queryKey: ['upcoming-intents'] });
      });
    },
    onError: (error) => {
      console.error(error);
      if (options.silent) return; // the caller shows its own error state
      vAgent.say(lines.error().text, 'concerned');
      const msg = String((error as { message?: string })?.message ?? '');
      toast.error(
        /bucket/i.test(msg)
          ? 'Screenshot storage is not set up yet (missing "memory-media" bucket).'
          : 'Failed to capture memory',
      );
    },
  });
}
