import correct from './06-correct-plugin.mjs';

const { reuse, ...manifest } = JSON.parse(correct.files['plugin.json']);

export default {
  ...correct,
  name: 'missing-reuse',
  why: 'A plugin can otherwise pass authoring verification without identifying existing owners.',
  files: { ...correct.files, 'plugin.json': JSON.stringify(manifest) },
  expect: { fail: ['reuse declared'] },
};
