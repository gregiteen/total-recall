import { getNodes } from './src/core/vault-cache.mjs';
import path from 'path';

const vaultDir = path.resolve('.agent/skills/total-recall/memory-vault');
const allNodes = getNodes(vaultDir);

console.log(allNodes.map(n => ({ slug: n.slug, tags: n.tags })));
