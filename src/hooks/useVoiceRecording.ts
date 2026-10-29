import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RecordingState = 'idle' | 'recording' | 'processing';

interface UseVoiceRecordingOptions {
  maxDuration?: number; // in seconds
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
  /** 0..1 loudness, ~30 times a second while recording */
  onLevel?: (level: number) => void;
  /** stop by itself after this many ms of quiet once the person has spoken */
  silenceStopMs?: number;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
  const { maxDuration = 60, onTranscription, onError, onLevel, silenceStopMs } = options;
  const levelRef = useRef(onLevel); levelRef.current = onLevel;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    levelRef.current?.(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setDuration(0);
  }, []);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    setState('processing');
    
    try {
      // Convert blob to base64
      const buffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64, mimeType: audioBlob.type },
      });

      if (error) throw error;
      
      if (data?.text) {
        onTranscription?.(data.text);
      } else {
        throw new Error('No transcription received');
      }
    } catch (err) {
      console.error('Transcription error:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to transcribe audio');
    } finally {
      setState('idle');
    }
  }, [onTranscription, onError]);

  const startRecording = useCallback(async () => {
    try {
      // Request high-quality, noise-suppressed mono audio for accurate STT.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // Prefer Opus in WebM (best compression + quality, widely supported).
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || '';

      const mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      cancelledRef.current = false;
      mediaRecorder.onstop = async () => {
        if (cancelledRef.current) { cleanup(); return; }
        const audioBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        await processAudio(audioBlob);
        cleanup();
      };

      mediaRecorder.start(1000); // Collect data every second

      // Loudness meter (drives V's listening aura) + optional stop-on-silence
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        audioCtxRef.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        let heard = false; let quietSince = performance.now();
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          const level = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          levelRef.current?.(level);
          const now = performance.now();
          if (level > 0.12) { heard = true; quietSince = now; }
          if (silenceStopMs && heard && now - quietSince > silenceStopMs && mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { /* meter is decoration only */ }
      setState('recording');

      // Duration timer
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setDuration(elapsed);
        
        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      onError?.('Microphone access denied. Please allow microphone access.');
      cleanup();
    }
  }, [maxDuration, processAudio, cleanup, onError, silenceStopMs]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    setState('idle');
  }, [cleanup]);

  return {
    state,
    duration,
    isRecording: state === 'recording',
    isProcessing: state === 'processing',
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
