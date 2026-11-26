import { useCallback, useEffect, useRef, useState } from 'react';
import { travelApi } from '../services/travelApi';

interface UseVoiceDictationOptions {
  /** Retained for backward compatibility; real microphone audio is always used. */
  demoPhrase?: string;
  barCount?: number;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio'));
    reader.readAsDataURL(blob);
  });
}

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

/**
 * Hybrid Real-Time Voice Dictation Hook (Option A):
 * 1. Primary (Chrome, Safari, Edge): Native Web Speech API (`interimResults: true`) for instant
 *    live word-by-word transcription paired with real `AnalyserNode` microphone waveform bars.
 * 2. Universal Fallback (Firefox / browsers without SpeechRecognition): Records audio via
 *    `MediaRecorder` and transcribes via `POST /api/voice/transcribe` (Gemini multimodal audio).
 */
export function useVoiceDictation({ barCount = 36 }: UseVoiceDictationOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'speech' | 'recorder' | null>(null);
  const [waveBars, setWaveBars] = useState<number[]>(() => Array.from({ length: barCount }, () => 4));

  const transcriptRef = useRef('');
  const finalSpeechRef = useRef('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<'speech' | 'recorder' | null>(null);
  const isRecordingRef = useRef(false);

  const releaseMicAndWave = useCallback(() => {
    if (rafRef.current !== null) {
      window.clearInterval(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setWaveBars(Array.from({ length: barCount }, () => 4));
  }, [barCount]);

  const startLiveWaveform = useCallback(
    (stream: MediaStream) => {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        audioCtxRef.current = ctx;

        const data = new Uint8Array(analyser.frequencyBinCount);
        rafRef.current = window.setInterval(() => {
          analyser.getByteFrequencyData(data);
          // Compute overall mic energy + per-bar spectral shape
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avgEnergy = sum / data.length;

          setWaveBars(
            Array.from({ length: barCount }, (_, idx) => {
              const bin = Math.min(
                data.length - 1,
                Math.floor((idx / Math.max(1, barCount - 1)) * (data.length * 0.65))
              );
              const center = barCount * 0.55;
              const centerBias = 1 - Math.abs(idx - center) / (barCount * 0.65);
              const rawVal = (data[bin] * 0.7 + avgEnergy * 0.3) / 255;
              const height = Math.round(3 + rawVal * 24 * (0.45 + Math.max(0, centerBias) * 0.75));
              return Math.max(3, Math.min(26, height));
            })
          );
        }, 65);
      } catch {
        // Non-fatal: keep gentle idle bars if AudioContext cannot start
      }
    },
    [barCount]
  );

  const startMediaRecorder = useCallback((stream: MediaStream) => {
    const mimeType = pickSupportedRecorderMime();
    audioChunksRef.current = [];
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        audioChunksRef.current.push(ev.data);
      }
    };
    recorder.start(250);
    recorderRef.current = recorder;
    modeRef.current = 'recorder';
    setMode('recorder');
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || isTranscribing) return;
    setError(null);
    setTranscript('');
    transcriptRef.current = '';
    finalSpeechRef.current = '';

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone input requires a modern browser over HTTPS.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as DOMException)?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Microphone access was blocked — allow mic permission in your browser to speak.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No microphone detected on this device.');
      } else {
        setError('Could not access your microphone. Please check browser audio permissions.');
      }
      return;
    }

    streamRef.current = stream;
    isRecordingRef.current = true;
    setIsRecording(true);
    startLiveWaveform(stream);

    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      try {
        const rec = new SpeechCtor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || 'en-US';

        rec.onresult = (ev) => {
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const res = ev.results[i];
            const piece = res[0]?.transcript || '';
            if (res.isFinal) {
              finalSpeechRef.current = `${finalSpeechRef.current} ${piece}`.replace(/\s+/g, ' ').trim();
            } else {
              interim += piece;
            }
          }
          const combined = `${finalSpeechRef.current} ${interim}`.replace(/\s+/g, ' ').trim();
          transcriptRef.current = combined;
          setTranscript(combined);
        };

        rec.onerror = (ev) => {
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            setError('Microphone access denied — allow mic access in your browser settings.');
            isRecordingRef.current = false;
            setIsRecording(false);
            releaseMicAndWave();
          } else if (
            (ev.error === 'network' || ev.error === 'audio-capture' || ev.error === 'aborted') &&
            streamRef.current &&
            typeof MediaRecorder !== 'undefined' &&
            !recorderRef.current &&
            !transcriptRef.current
          ) {
            // Seamlessly switch to server-side Gemini audio transcription if Web Speech service fails
            try {
              startMediaRecorder(streamRef.current);
            } catch {
              // Ignore secondary fallback error
            }
          }
        };

        rec.onend = () => {
          // If the user is still actively recording in Web Speech mode, restart seamlessly
          if (isRecordingRef.current && modeRef.current === 'speech' && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // Ignore restart race
            }
          }
        };

        recognitionRef.current = rec;
        modeRef.current = 'speech';
        setMode('speech');
        rec.start();
        return;
      } catch {
        // Fall through cleanly to MediaRecorder -> Gemini Audio
      }
    }

    // Universal Fallback: MediaRecorder -> POST /api/voice/transcribe
    if (typeof MediaRecorder !== 'undefined') {
      try {
        startMediaRecorder(stream);
      } catch {
        isRecordingRef.current = false;
        setIsRecording(false);
        releaseMicAndWave();
        setError('Voice recording is not supported in this browser.');
      }
    } else {
      isRecordingRef.current = false;
      setIsRecording(false);
      releaseMicAndWave();
      setError('Voice recording is not supported in this browser.');
    }
  }, [isTranscribing, releaseMicAndWave, startLiveWaveform, startMediaRecorder]);

  /**
   * Stops active dictation and resolves to the final transcribed text
   * (instant in Web Speech mode; awaits Gemini audio transcription in MediaRecorder fallback mode).
   */
  const stopRecording = useCallback(async (): Promise<string> => {
    if (!isRecordingRef.current) return transcriptRef.current.trim();
    isRecordingRef.current = false;
    setIsRecording(false);

    if (recognitionRef.current) {
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // Ignore stop error
      }
    }

    const activeRecorder = recorderRef.current;
    recorderRef.current = null;

    if (activeRecorder && activeRecorder.state !== 'inactive') {
      const mimeType = activeRecorder.mimeType || 'audio/webm';
      const audioBlob = await new Promise<Blob>((resolve) => {
        activeRecorder.onstop = () => {
          resolve(new Blob(audioChunksRef.current, { type: mimeType }));
        };
        try {
          activeRecorder.stop();
        } catch {
          resolve(new Blob(audioChunksRef.current, { type: mimeType }));
        }
      });

      releaseMicAndWave();
      modeRef.current = null;
      setMode(null);

      if (audioBlob.size < 400) {
        return transcriptRef.current.trim();
      }

      setIsTranscribing(true);
      try {
        const base64 = await blobToBase64(audioBlob);
        const res = await travelApi.transcribeVoice(base64, mimeType);
        const text = (res.transcript || '').trim();
        transcriptRef.current = text;
        setTranscript(text);
        if (!text) {
          setError('Didn’t catch any speech — try speaking a little closer to your mic.');
        }
        return text;
      } catch {
        setError('Could not transcribe audio right now — please try again or type your prompt.');
        return '';
      } finally {
        setIsTranscribing(false);
      }
    }

    releaseMicAndWave();
    modeRef.current = null;
    setMode(null);
    return transcriptRef.current.trim();
  }, [releaseMicAndWave]);

  const reset = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsTranscribing(false);
    setError(null);
    setTranscript('');
    transcriptRef.current = '';
    finalSpeechRef.current = '';
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    recorderRef.current = null;
    audioChunksRef.current = [];
    modeRef.current = null;
    setMode(null);
    releaseMicAndWave();
  }, [releaseMicAndWave]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore
        }
      }
      releaseMicAndWave();
    };
  }, [releaseMicAndWave]);

  return {
    isRecording,
    isTranscribing,
    transcript,
    error,
    mode,
    waveBars,
    startRecording,
    stopRecording,
    reset,
    clearError: () => setError(null),
  };
}
