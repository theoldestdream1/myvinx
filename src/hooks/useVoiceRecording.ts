import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

type RecordingState = 'idle' | 'recording' | 'processing';

interface UseVoiceRecordingOptions {
  maxDuration?: number; // in seconds
  onTranscription?: (text: string) => void;
  onError?: (error: string) => void;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
  const { maxDuration = 60, onTranscription, onError } = options;
  
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        await processAudio(audioBlob);
        cleanup();
      };

      mediaRecorder.start(1000); // Collect data every second
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
  }, [maxDuration, processAudio, cleanup, onError]);

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
