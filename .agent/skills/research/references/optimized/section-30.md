## 🛠️ CODE INTEGRATION CHEATSHEET

Here is a quick Node.js wrapper for agents wishing to query and manage research programmatically inside workspace tools:

```javascript
import { spawnSync } from 'node:child_process';

const BRAIN_URL = process.env.TR_BRAIN || 'http://localhost:3000';
const PAT_TOKEN = process.env.TR_PAT;

function callBrain(method, path, body = null) {
  const args = [
    '-s',
    '-X', method,
    '-H', `Authorization: Bearer ${PAT_TOKEN}`,
    '-H', 'Content-Type: application/json'
  ];
  if (body) {
    args.push('-d', JSON.stringify(body));
  }
  args.push(`${BRAIN_URL}${path}`);
  
  const res = spawnSync('curl', args, { encoding: 'utf8' });
  if (res.error) throw res.error;
  return JSON.parse(res.stdout);
}

// Example 1: Enqueue a research task
const enqueued = callBrain('POST', '/api/research', {
  topic: 'Ollama model catalog specifications',
  notes: 'Query local endpoint catalog model sizes.'
});
console.log('Enqueued:', enqueued.id);

// Example 2: Search active items
const results = callBrain('GET', '/api/research?query=Ollama');
console.log(`Found ${results.total} matching research tasks.`);
```
