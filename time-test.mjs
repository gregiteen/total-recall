console.time('total');
import { ensureFullProjectBrain } from './src/core/project-brain.mjs';
console.time('ensure');
ensureFullProjectBrain('/tmp/test-brain-time');
console.timeEnd('ensure');
console.timeEnd('total');
