import { useState, useRef, useEffect } from 'react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  isRecording?: boolean;
}

export function VoiceInput({ onTranscript, isRecording = false }: VoiceInputProps) {
  const [recording, setRecording] = useState(isRecording);
  const recognitionRef = useRef<any>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;

        recognitionRef.current.onresult = (event: any) => {
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
        setSupported(false);
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
        className="chat-send-btn" 
        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-tertiary)', opacity: 0.5, cursor: 'not-allowed' }}
        title="Voice input not supported"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
      </button>
    );
  }

  return (
    <button 
      onClick={toggleRecording}
      className="chat-send-btn"
      style={{
        background: recording ? 'var(--error)' : 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        color: recording ? '#fff' : 'var(--text-secondary)',
        transition: 'all var(--transition-fast)'
      }}
      title={recording ? "Stop recording" : "Start voice input"}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
    </button>
  );
}
