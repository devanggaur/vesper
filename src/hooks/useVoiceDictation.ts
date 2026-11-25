import { useEffect, useState } from 'react';

interface UseVoiceDictationOptions {
  /** Demo phrase simulated while microphone input is active (swap for Web Speech API / Whisper backend) */
  demoPhrase: string;
  barCount?: number;
}

/**
 * Manages interactive voice dictation state, animated audio waveform bar heights,
 * and live streaming transcript text.
 *
 * Backend hookup: replace the simulated character interval with Web Speech API
 * (`SpeechRecognition`) or a streaming transcription endpoint.
 */
export function useVoiceDictation({ demoPhrase, barCount = 36 }: UseVoiceDictationOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [waveBars, setWaveBars] = useState<number[]>(() => Array.from({ length: barCount }, () => 4));

  useEffect(() => {
    if (!isRecording) return;

    let charIdx = 0;
    setTranscript('');

    const waveTimer = window.setInterval(() => {
      setWaveBars((prev) =>
        prev.map((_, i) => {
          const center = barCount * 0.6;
          const centerBias = 1 - Math.abs(i - center) / center;
          return Math.max(3, Math.round((Math.random() * 20 + 4) * (0.35 + centerBias * 0.85)));
        })
      );
    }, 95);

    const typeTimer = window.setInterval(() => {
      charIdx += 2;
      if (charIdx <= demoPhrase.length) {
        setTranscript(demoPhrase.slice(0, charIdx));
      } else {
        setTranscript(demoPhrase);
        clearInterval(typeTimer);
      }
    }, 58);

    return () => {
      clearInterval(waveTimer);
      clearInterval(typeTimer);
    };
  }, [isRecording, demoPhrase, barCount]);

  const startRecording = () => setIsRecording(true);
  const stopRecording = () => setIsRecording(false);
  const reset = () => {
    setIsRecording(false);
    setTranscript('');
  };

  return {
    isRecording,
    transcript,
    waveBars,
    startRecording,
    stopRecording,
    reset,
  };
}
