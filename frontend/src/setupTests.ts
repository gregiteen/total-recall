import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

class MockEventSource {
  constructor(_url: string) {}
  close() {}
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
}
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'EventSource', {
    value: MockEventSource,
  });
  
  if (window.HTMLCanvasElement) {
    window.HTMLCanvasElement.prototype.getContext = () => null;
  }
}
