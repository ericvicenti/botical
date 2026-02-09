# Voice Interface

Browser-based voice input/output for Botical task chat, using the Web Speech API (zero external dependencies).

## Features

### Speech-to-Text (STT)
- **Push-to-Talk (PTT):** Hold the 🎤 button for >300ms → records while held, stops on release
- **Voice Activity Detection (VAD):** Quick-click the 🎤 button → listens continuously, auto-stops after 2s of silence
- Interim (partial) transcripts shown in real-time above the input field
- Recognized text appends to the text input, so you can mix voice and typing

### Text-to-Speech (TTS)
- Toggle the 🔊 button in the toolbar to enable auto-reading of assistant responses
- Uses Web Speech Synthesis API (built into Chrome/Edge/Safari)
- Only reads completed assistant messages (not streaming)
- Cancels previous speech when a new response arrives

## Architecture

```
webui/src/
├── hooks/useVoice.ts           # Core voice hook (STT + TTS logic)
├── components/ui/VoiceButton.tsx  # VoiceButton + TTSToggle components
└── components/tasks/TaskChat.tsx  # Integration point
```

### `useVoice` Hook
Encapsulates all Web Speech API interaction:
- `startListening()` / `stopListening()` / `toggleListening()` for STT
- `speak(text)` / `stopSpeaking()` for TTS
- Returns `isListening`, `isSpeaking`, `interim`, `error`, `supported`

### `VoiceButton` Component
Smart interaction model:
- **Quick click (<300ms):** Toggles VAD mode
- **Long press (≥300ms):** Enters PTT mode, records until release
- Visual feedback: red glow + pulse animation while listening
- Shows interim transcript tooltip and error messages

### `TTSToggle` Component
Simple on/off toggle for auto-reading responses. Placed in the TaskChat toolbar.

## Browser Support

| Browser | STT | TTS |
|---------|-----|-----|
| Chrome/Edge | ✅ | ✅ |
| Safari | ✅ | ✅ |
| Firefox | ❌ (no SpeechRecognition) | ✅ |

The voice button auto-hides in browsers that don't support SpeechRecognition.

## Usage

1. Open any task chat at https://leopard.verse.link
2. Click the **🎤 microphone** button next to the send button to start voice input
3. Speak — your words appear in the text field
4. Click **Send** or press Enter to submit
5. Toggle the **🔊 speaker** icon in the toolbar to hear responses read aloud

## Future Improvements

- [ ] ElevenLabs / OpenAI TTS integration for higher-quality voices
- [ ] Configurable language selection
- [ ] Voice-only conversational mode (auto-send after speech)
- [ ] Keyboard shortcut for PTT (e.g., hold Space)
- [ ] Noise gate / audio level visualization
