import { syncUsageLedger } from './src/core/usage-tracker.mjs';
const data = syncUsageLedger();
console.log(JSON.stringify(data, null, 2));
