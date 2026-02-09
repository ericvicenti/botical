import { useState, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import { Mic, Volume2, VolumeX } from "lucide-react";
import { useVoice } from "@/hooks/useVoice";

interface VoiceButtonProps {
  /** Called with recognized text to insert into input */
  onTranscript: (text: string) => void;
  /** Called while speaking with partial text */
  onInterim?: (text: string) => void;
  /** Whether voice button is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Voice input button with push-to-talk and voice activity detection modes.
 * 
 * - Click: Toggle VAD mode (auto-detect speech, stops after silence)
 * - Hold: Push-to-talk (records only while pressed)
 * - Long-press > 300ms without release = PTT mode
 */
export function VoiceButton({
  onTranscript,
  onInterim,
  disabled = false,
  className,
}: VoiceButtonProps) {
  const [isPTTActive, setIsPTTActive] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPTTRef = useRef(false);

  const {
    supported,
    isListening,
    interim,
    startListening,
    stopListening,
    toggleListening,
    error,
  } = useVoice({
    onTranscript,
    onInterim,
    vadSilenceMs: 2000,
  });

  // Don't render if not supported
  if (!supported) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    isPTTRef.current = false;

    // Start a timer — if held > 300ms, it's PTT
    pressTimerRef.current = setTimeout(() => {
      isPTTRef.current = true;
      setIsPTTActive(true);
      startListening();
    }, 300);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (isPTTRef.current) {
      // Was PTT — stop listening
      setIsPTTActive(false);
      isPTTRef.current = false;
      stopListening();
    } else {
      // Was a quick click — toggle VAD mode
      toggleListening();
    }
  };

  const handlePointerLeave = () => {
    // If pointer leaves while holding, treat as release
    if (isPTTRef.current) {
      setIsPTTActive(false);
      isPTTRef.current = false;
      stopListening();
    }
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        disabled={disabled}
        className={cn(
          "p-3 rounded-xl transition-all duration-200 select-none touch-none",
          "flex items-center justify-center",
          isListening
            ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
            : "bg-bg-elevated text-text-muted border border-border hover:text-text-primary hover:border-accent-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        title={
          isListening
            ? isPTTActive
              ? "Release to stop (push-to-talk)"
              : "Click to stop listening"
            : "Click to listen · Hold to push-to-talk"
        }
        data-testid="voice-button"
      >
        {isListening ? (
          <div className="relative">
            <Mic className="w-5 h-5" />
            {/* Pulsing ring while listening */}
            <span className="absolute inset-0 rounded-full animate-ping bg-red-400/30" />
          </div>
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </button>

      {/* Interim transcript tooltip */}
      {interim && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-bg-primary border border-border rounded-lg shadow-lg text-sm text-text-secondary whitespace-nowrap max-w-xs truncate z-50">
          {interim}
        </div>
      )}

      {/* Error tooltip */}
      {error && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg shadow-lg text-xs text-red-400 whitespace-nowrap z-50">
          {error}
        </div>
      )}

      {/* PTT indicator */}
      {isPTTActive && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}

/**
 * TTS toggle button for reading assistant responses aloud.
 */
export function TTSToggle({
  enabled,
  onToggle,
  className,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!enabled)}
      className={cn(
        "p-2 rounded-lg transition-colors",
        enabled
          ? "bg-accent-primary/20 text-accent-primary"
          : "hover:bg-bg-elevated text-text-muted hover:text-text-primary",
        className
      )}
      title={enabled ? "Disable auto-read responses" : "Enable auto-read responses"}
      data-testid="tts-toggle"
    >
      {enabled ? (
        <Volume2 className="w-5 h-5" />
      ) : (
        <VolumeX className="w-5 h-5" />
      )}
    </button>
  );
}
