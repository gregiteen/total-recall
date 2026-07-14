import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceInput } from './VoiceInput';

describe('VoiceInput', () => {
  it('renders disabled button if SpeechRecognition is not supported', () => {
    // Delete any mock to simulate unsupported browser
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    render(<VoiceInput onTranscript={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
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

    (window as any).SpeechRecognition = MockSpeechRecognition;

    render(<VoiceInput onTranscript={() => {}} />);
    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
    
    // Click to start
    fireEvent.click(button);
    expect(mockStart).toHaveBeenCalled();
  });
});
