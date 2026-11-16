// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} })

import { saveConfigJson, describeSaveFailure } from './config'

describe('config save outcomes', () => {
  beforeEach(() => mockFetch.mockReset())

  it('resolves on success', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, applied: ['security'] }) } as Response)
    await expect(saveConfigJson({ security: {}, budget: {} })).resolves.toBeUndefined()
  })

  it('names applied, failed and not-attempted sections of a partial server result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 500,
      json: () => Promise.resolve({ error: 'Config update did not complete.', applied: ['secrets', 'security'], failed: 'budget', not_attempted: ['brain'] }),
    } as Response)
    await expect(saveConfigJson({ security: {}, budget: {} })).rejects.toThrow(
      'Config update did not complete. Applied: secrets, security. Failed: budget. Not attempted: brain.')
  })

  it('reports nothing applied for a strict rejection and keeps the server message', () => {
    expect(describeSaveFailure(400, { error: 'Unsupported or invalid config fields: brain.secret. Nothing was changed.' }))
      .toBe('Unsupported or invalid config fields: brain.secret. Nothing was changed.')
    expect(describeSaveFailure(503, { error: 'Auth credential update did not complete.', applied: [], failed: 'secrets', not_attempted: ['security'] }))
      .toBe('Auth credential update did not complete. Applied: nothing. Failed: secrets. Not attempted: security.')
  })

  it('falls back to the status when the body is not JSON or has no error', () => {
    expect(describeSaveFailure(502, null)).toBe('Config JSON API error: 502')
    expect(describeSaveFailure(500, { applied: 'x', failed: 7 })).toBe('Config JSON API error: 500')
  })
})
