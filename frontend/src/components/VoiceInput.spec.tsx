import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceInput } from './VoiceInput';

describe('VoiceInput', () => {
  it('renders disabled button if SpeechRecognition is not supported', async () => {
    // Delete any mock to simulate unsupported browser
    delete (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

    render(<VoiceInput onTranscript={() => {}} />);
    const button = screen.getByRole('button');
    await waitFor(() => expect(button).toBeDisabled());
    expect(button.title).toBe('Voice input not supported');
  });

  it('renders active button and starts recording when supported', () => {
    const mockStart = vi.fn();
    const mockStop = vi.fn();
    
    class MockSpeechRecognition {
      continuous = false;
      interimResults = false;
      start = mockStart;
      stop = mockStop;
    }

    (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition = MockSpeechRecognition;

    render(<VoiceInput onTranscript={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    
    // Click to start
    fireEvent.click(button);
    expect(mockStart).toHaveBeenCalled();
  });
});
