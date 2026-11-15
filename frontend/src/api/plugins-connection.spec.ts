import { describe, expect, it } from 'vitest'
import { parsePluginConnection } from './plugins'

const NOW = Date.parse('2026-11-15T12:00:00.000Z')
const base = { pluginId: 'demo', reported: true, status: 'connected', method: 'api-key', checkedAt: '2026-11-15T11:00:00.000Z', freshness: 'fresh' }
const parse = (data: unknown) => parsePluginConnection(data, 'demo', NOW)

describe('parsePluginConnection', () => {
  it('accepts exactly the documented shapes and drops everything else', () => {
    expect(parse({ ...base, endpoint: 'https://CANARY', message: 'CANARY' })).toEqual({ reported: true, status: 'connected', method: 'api-key', checkedAt: base.checkedAt })
    expect(parse({ ...base, status: 'unknown', checkedAt: null, freshness: 'none' })).toEqual({ reported: true, status: 'unknown', method: 'api-key', checkedAt: null })
    expect(parse({ ...base, status: 'failed', failure: { code: 'timeout', message: 'CANARY' } })).toEqual({ reported: true, status: 'failed', method: 'api-key', checkedAt: base.checkedAt, failure: 'timeout' })
    expect(parse({ ...base, status: 'stale', lastStatus: 'failed', failure: { code: 'timeout' } })).toMatchObject({ status: 'stale', lastStatus: 'failed', failure: 'timeout' })
  })

  it.each([
    ['null', null], ['a string', 'connected'], ['unreported', { pluginId: 'demo', reported: false }],
    ['another plugin', { ...base, pluginId: 'other' }], ['no method', { ...base, method: undefined }],
    ['an uncurated method', { ...base, method: 'password' }], ['no time', { ...base, checkedAt: undefined }],
    ['a non-finite time', { ...base, checkedAt: 'soon' }], ['a future time', { ...base, checkedAt: '2999-01-01T00:00:00.000Z' }],
    ['unknown with a time', { ...base, status: 'unknown' }], ['failed without a code', { ...base, status: 'failed' }],
    ['failed with an uncurated code', { ...base, status: 'failed', failure: { code: 'raw body' } }],
    ['connected with a failure', { ...base, failure: { code: 'timeout' } }],
    ['stale without a last status', { ...base, status: 'stale' }], ['an unknown status', { ...base, status: 'healthy' }],
  ])('treats %s as unreported', (_name, data) => {
    expect(parse(data)).toEqual({ reported: false })
  })
})
