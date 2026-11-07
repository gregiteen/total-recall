import correct from './06-correct-plugin.mjs';

const manifest = JSON.parse(correct.files['plugin.json']);
manifest.reuse.commands.push('total-recall auth nonexistent-operation');

export default {
  ...correct,
  name: 'unresolved-owner-command',
  why: 'A declared operation must exist in the installed owner catalog.',
  files: { ...correct.files, 'plugin.json': JSON.stringify(manifest) },
  expect: { fail: ['owner commands resolve'] },
};
