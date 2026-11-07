import correct from './06-correct-plugin.mjs';

const manifest = JSON.parse(correct.files['plugin.json']);
manifest.requires = ['mesh'];

export default {
  ...correct,
  name: 'missing-brick',
  why: 'An installed plugin is insufficient when a project declares its brick as a code dependency.',
  files: { ...correct.files, 'plugin.json': JSON.stringify(manifest) },
  expect: { fail: ['required bricks present'] },
};
