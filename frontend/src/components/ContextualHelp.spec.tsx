// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContextualHelp from './ContextualHelp';

function renderWithRouter(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ContextualHelp />
    </MemoryRouter>
  );
}

describe('ContextualHelp', () => {
  it('renders the help button', () => {
    renderWithRouter();
    const btn = screen.getByTitle('Page Help');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent('?');
  });

  it('opens overlay when help button is clicked', () => {
    renderWithRouter('/');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(screen.getByText(/Chat Interface/)).toBeInTheDocument();
  });

  it('shows memory vault help for /memory route', () => {
    renderWithRouter('/memory');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(screen.getByText(/Memory Vault/)).toBeInTheDocument();
  });

  it('shows graph help for /graph route', () => {
    renderWithRouter('/graph');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(screen.getByText(/Concept Graph/)).toBeInTheDocument();
  });

  it('shows fallback for unknown routes', () => {
    renderWithRouter('/unknown-route');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(screen.getByText(/No specific documentation/)).toBeInTheDocument();
  });

  it('closes overlay when close button is clicked', () => {
    renderWithRouter('/');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(screen.getByText(/Chat Interface/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText(/Chat Interface/)).not.toBeInTheDocument();
  });

  it('closes overlay when backdrop is clicked', () => {
    renderWithRouter('/');
    fireEvent.click(screen.getByTitle('Page Help'));
    const overlay = screen.getByText(/Chat Interface/).parentElement?.parentElement;
    if (overlay) fireEvent.click(overlay);
    expect(screen.queryByText(/Chat Interface/)).not.toBeInTheDocument();
  });
});
