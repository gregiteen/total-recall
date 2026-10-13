import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/vault.mjs');
export const { isSafeVaultName, atomicWrite, safeStringify, walkMd, loadNodes, loadMergedNodes, writeNode, deleteNode, createMemoryNode, loadSkills } = hostModule;
