import { describe, it, expect } from 'vitest';
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

  it('opens overlay when help button is clicked', async () => {
    renderWithRouter('/');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(await screen.findByText(/Chat Interface/)).toBeInTheDocument();
  });

  it('shows memory vault help for /memory route', async () => {
    renderWithRouter('/memory');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(await screen.findByText(/Memory Vault/)).toBeInTheDocument();
  });

  it('shows graph help for /graph route', async () => {
    renderWithRouter('/graph');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(await screen.findByText(/Concept Graph/)).toBeInTheDocument();
  });

  it('shows fallback for unknown routes', async () => {
    renderWithRouter('/unknown-route');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(await screen.findByText(/No specific documentation/)).toBeInTheDocument();
  });

  it('closes overlay when close button is clicked', async () => {
    renderWithRouter('/');
    fireEvent.click(screen.getByTitle('Page Help'));
    expect(await screen.findByText(/Chat Interface/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByText(/Chat Interface/)).not.toBeInTheDocument();
  });

  it('closes overlay when backdrop is clicked', async () => {
    renderWithRouter('/');
    fireEvent.click(screen.getByTitle('Page Help'));
    const text = await screen.findByText(/Chat Interface/);
    const overlay = text.parentElement?.parentElement;
    if (overlay) fireEvent.click(overlay);
    expect(screen.queryByText(/Chat Interface/)).not.toBeInTheDocument();
  });
});
