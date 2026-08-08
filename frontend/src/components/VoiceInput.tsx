import { useState, useRef, useEffect } from 'react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  isRecording?: boolean;
}

interface SpeechRecognitionObj {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionObj;
}

export function VoiceInput({ onTranscript, isRecording = false }: VoiceInputProps) {
  const [recording, setRecording] = useState(isRecording);
  const recognitionRef = useRef<SpeechRecognitionObj | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const win = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor, webkitSpeechRecognition?: SpeechRecognitionConstructor };
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          onTranscript(transcript);
          setRecording(false);
        };

        recognitionRef.current.onerror = () => {
          setRecording(false);
        };
        
        recognitionRef.current.onend = () => {
          setRecording(false);
        };
      } else {
        setTimeout(() => setSupported(false), 0);
      }
    }
  }, [onTranscript]);

  const toggleRecording = () => {
    if (!supported) return;
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
    } else {
      recognitionRef.current?.start();
      setRecording(true);
    }
  };

  if (!supported) {
    return (
      <button 
        disabled 
        className="btn btn-ghost" 
        style={{ 
          width: 44, 
          height: 44, 
          padding: 0, 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          background: 'rgba(148, 163, 184, 0.03)', 
          border: '1px solid var(--border)', 
          color: 'var(--text-tertiary)', 
          opacity: 0.5, 
          cursor: 'not-allowed' 
        }}
        title="Voice input not supported"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
      </button>
    );
  }

  return (
    <button 
      onClick={toggleRecording}
      className={`btn btn-ghost ${recording ? 'active' : ''}`}
      style={{
        width: 44,
        height: 44,
        padding: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: recording ? 'var(--error-muted)' : 'rgba(148, 163, 184, 0.06)',
        border: recording ? '1px solid var(--error)' : '1px solid var(--border)',
        color: recording ? 'var(--error)' : 'var(--text-tertiary)',
        transition: 'all var(--transition-fast)'
      }}
      title={recording ? "Stop recording" : "Start voice input"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
    </button>
  );
}
