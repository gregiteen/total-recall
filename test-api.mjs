import { resolveAllVaultsFromQuery } from './src/server/vault-resolver.mjs';
console.log(resolveAllVaultsFromQuery({ query: { brain: 'global' }, headers: {} }));
