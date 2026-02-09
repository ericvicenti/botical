import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type VoiceMode = "off" | "ptt" | "vad";

export interface UseVoiceOptions {
  /** Called with final transcript when speech ends */
  onTranscript?: (text: string) => void;
  /** Called with interim (partial) transcript while speaking */
  onInterim?: (text: string) => void;
  /** Language for speech recognition (default: "en-US") */
  lang?: string;
  /** Voice Activity Detection silence timeout in ms (default: 1500) */
  vadSilenceMs?: number;
}

export interface UseVoiceReturn {
  /** Whether the browser supports SpeechRecognition */
  supported: boolean;
  /** Whether currently listening */
  isListening: boolean;
  /** Current voice mode */
  mode: VoiceMode;
  /** Set voice mode */
  setMode: (mode: VoiceMode) => void;
  /** Interim transcript (updates while speaking) */
  interim: string;
  /** Start listening (for PTT: call on mousedown/keydown) */
  startListening: () => void;
  /** Stop listening (for PTT: call on mouseup/keyup) */
  stopListening: () => void;
  /** Toggle listening for VAD mode */
  toggleListening: () => void;
  /** Speak text aloud using Web Speech Synthesis */
  speak: (text: string) => void;
  /** Stop any ongoing speech */
  stopSpeaking: () => void;
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Error message, if any */
  error: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionType = any;

function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    onTranscript,
    onInterim,
    lang = "en-US",
    vadSilenceMs = 1500,
  } = options;

  const SpeechRecognitionClass = getSpeechRecognition();
  const supported = !!SpeechRecognitionClass;

  const [mode, setMode] = useState<VoiceMode>("ptt");
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const vadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);

  // Stable callback refs
  const onTranscriptRef = useRef(onTranscript);
  const onInterimRef = useRef(onInterim);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onInterimRef.current = onInterim;
  }, [onTranscript, onInterim]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionClass) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    // Stop any existing session
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    setError(null);
    stoppingRef.current = false;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) {
        setInterim(interimTranscript);
        onInterimRef.current?.(interimTranscript);
      }

      if (finalTranscript) {
        setInterim("");
        onTranscriptRef.current?.(finalTranscript.trim());

        // In VAD mode, reset the silence timer on final results
        if (vadTimerRef.current) clearTimeout(vadTimerRef.current);
        vadTimerRef.current = setTimeout(() => {
          if (!stoppingRef.current) {
            recognition.stop();
          }
        }, vadSilenceMs);
      }
    };

    recognition.onerror = (event: any) => {
      // "aborted" is expected when we stop manually
      if (event.error === "aborted" || event.error === "no-speech") return;
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterim("");
      recognitionRef.current = null;
      if (vadTimerRef.current) {
        clearTimeout(vadTimerRef.current);
        vadTimerRef.current = null;
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError("Failed to start speech recognition. Check microphone permissions.");
    }
  }, [SpeechRecognitionClass, lang, vadSilenceMs]);

  const stopListening = useCallback(() => {
    stoppingRef.current = true;
    if (vadTimerRef.current) {
      clearTimeout(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // ─── TTS ─────────────────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      setError("Speech synthesis not supported");
      return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [lang]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  return {
    supported,
    isListening,
    mode,
    setMode,
    interim,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
    isSpeaking,
    error,
  };
}
