import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EmbeddingProviderPanel } from './EmbeddingProviderPanel'
import * as api from '../api/embeddings'
import type { EmbeddingProviderStatus } from '../api/embeddings'

vi.mock('../api/embeddings')

// Annotated against the real contract: without it TS narrows `endpoint` to
// string and `reason` to null from the literal, so the "nothing reachable"
// case below cannot be expressed.
const LOCAL_OK: EmbeddingProviderStatus = {
  dims: 768,
  local: {
    available: true,
    endpoint: 'http://100.64.0.2:11434',
    selected: 'nomic-embed-text:latest',
    preferred: null,
    dims: 768,
    candidates: [
      {
        name: 'nomic-embed-text:latest',
        size: 274_000_000,
        family: 'nomic-bert',
        capabilities: ['embedding'],
        embedding: true,
        dims: 768,
        compatible: true,
      },
      {
        name: 'gemma4:latest',
        size: 9_608_000_000,
        family: 'gemma4',
        capabilities: ['completion'],
        embedding: false,
        dims: 2560,
        compatible: false,
      },
    ],
    reason: null,
  },
  fallbacks: [
    { provider: 'openrouter', configured: true },
    { provider: 'google', configured: false },
    { provider: 'openai', configured: false },
  ],
}

beforeEach(() => {
  vi.mocked(api.fetchEmbeddingProvider).mockResolvedValue(structuredClone(LOCAL_OK))
  vi.mocked(api.setEmbeddingModel).mockResolvedValue({ ok: true, pinned: null, selected: null })
  vi.mocked(api.rediscoverEmbeddingProvider).mockResolvedValue({ ok: true, local: LOCAL_OK.local })
})

describe('EmbeddingProviderPanel', () => {
  it('shows the resolved endpoint and selected model', async () => {
    render(<EmbeddingProviderPanel />)
    expect(await screen.findByTestId('embed-endpoint')).toHaveTextContent('http://100.64.0.2:11434')
    expect(screen.getByTestId('embed-selected')).toHaveTextContent('nomic-embed-text:latest')
    expect(screen.getByTestId('embed-selected')).toHaveTextContent('auto')
  })

  it('lists incompatible models with the reason instead of hiding them', async () => {
    render(<EmbeddingProviderPanel />)
    // An operator who pulled a chat model needs to see why it is unusable.
    expect(await screen.findByText('gemma4:latest')).toBeInTheDocument()
    expect(screen.getByText(/cannot embed/i)).toBeInTheDocument()
  })

  it('offers no "Use" button for a model that cannot embed', async () => {
    render(<EmbeddingProviderPanel />)
    await screen.findByText('gemma4:latest')
    // Only compatible, non-selected models are pinnable; here that set is empty.
    expect(screen.queryByRole('button', { name: /^use$/i })).not.toBeInTheDocument()
  })

  it('pins a model when the operator picks one', async () => {
    const withOther = structuredClone(LOCAL_OK)
    withOther.local.candidates.push({
      name: 'other-embed:latest',
      size: 100_000_000,
      family: 'other',
      capabilities: ['embedding'],
      embedding: true,
      dims: 768,
      compatible: true,
    })
    vi.mocked(api.fetchEmbeddingProvider).mockResolvedValue(withOther)

    render(<EmbeddingProviderPanel />)
    const useBtn = await screen.findByRole('button', { name: /^use$/i })
    await userEvent.click(useBtn)

    await waitFor(() => expect(api.setEmbeddingModel).toHaveBeenCalledWith('other-embed:latest'))
  })

  it('reports the hosted fallback state when nothing local answers', async () => {
    const down = structuredClone(LOCAL_OK)
    down.local = {
      ...down.local,
      available: false,
      endpoint: null,
      selected: null,
      candidates: [],
      reason: 'No Ollama endpoint answered on this host or any online mesh peer.',
    }
    vi.mocked(api.fetchEmbeddingProvider).mockResolvedValue(down)

    render(<EmbeddingProviderPanel />)
    expect(await screen.findByTestId('embed-availability')).toHaveTextContent('hosted fallback')
    expect(screen.getByRole('status')).toHaveTextContent(/No Ollama endpoint answered/)
  })

  it('surfaces a load failure rather than rendering an empty panel', async () => {
    vi.mocked(api.fetchEmbeddingProvider).mockRejectedValue(new Error('Authentication required'))
    render(<EmbeddingProviderPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Authentication required')
  })

  it('re-discovers on demand', async () => {
    render(<EmbeddingProviderPanel />)
    await userEvent.click(await screen.findByRole('button', { name: /re-discover/i }))
    await waitFor(() => expect(api.rediscoverEmbeddingProvider).toHaveBeenCalled())
  })
})
