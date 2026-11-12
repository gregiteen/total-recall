/**
 * A capability that depends on Total Recall and ships a placeholder.
 *
 * Observed: a vendored brick called the `total-recall` binary for every
 * credential read — failing with `Auth credential read failed` once it was
 * absent — and carried `https://example.com/checkout/success`.
 */
import correct from './06-correct-plugin.mjs';

const CAPABILITY = `
import { spawnSync } from 'node:child_process'

function secret() {
  const binary = process.env.TOTAL_RECALL_BIN || 'total-recall'
  const out = spawnSync(binary, ['auth', 'secret', 'get', 'EXAMPLE_API_KEY', '--json'])
  return JSON.parse(out.stdout).value
}

export async function readStatus({ endpoint }) {
  const url = endpoint ? endpoint + '/status' : 'https://example.com/status'
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + secret() },
  })
  return res.json()
}
`;

export default {
  ...correct,
  name: 'host-leak-in-scaffold',
  why: 'A standalone capability must run without Total Recall and use the caller’s endpoint.',
  files: { ...correct.files, 'capability/index.mjs': CAPABILITY },
  expect: {
    fail: ['no Total Recall dependency', 'no placeholder values'],
  },
};
