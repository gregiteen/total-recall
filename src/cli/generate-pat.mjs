import { issueKey } from '../server/keys.mjs';

function parseName(args) {
  const idx = args.indexOf('--name');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (['--scope', '--scopes', '--expires'].includes(args[i])) {
      i++;
      continue;
    }
    if (!args[i].startsWith('--')) positional.push(args[i]);
  }
  return positional.join(' ').trim() || 'CLI Key';
}

function parseScopes(args) {
  const idx = args.indexOf('--scope');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1].split(',').map(scope => scope.trim());
  const scopesIdx = args.indexOf('--scopes');
  if (scopesIdx !== -1 && args[scopesIdx + 1]) return args[scopesIdx + 1].split(',').map(scope => scope.trim());
  return ['*'];
}

function parseExpiresAt(args) {
  const idx = args.indexOf('--expires');
  if (idx === -1 || !args[idx + 1]) return null;
  const value = args[idx + 1];
  if (/^\d+d$/.test(value)) {
    const days = Number(value.slice(0, -1));
    return new Date(Date.now() + days * 86400000).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return value;
}

export default async function generatePat(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  total-recall generate-pat --name "codex"
  total-recall generate-pat --name "readonly" --scope "models:read,ssss:read,memory:read"
  total-recall generate-pat --name "temp" --expires 30d

  Issues a Personal Access Token and stores only its hash in
  ~/.agent/config/keys.jsonl. The token is printed once.

  Options:
    --name <name>       Human-readable key name
    --scope <list>      Comma-separated scopes (default: *)
    --scopes <list>     Alias for --scope
    --expires <date>    ISO date or relative days, e.g. 2026-06-01 or 30d
`);
    return;
  }

  const key = issueKey(parseName(args), {
    scopes: parseScopes(args),
    expires_at: parseExpiresAt(args)
  });
  console.log(`Name:  ${key.name}`);
  console.log(`ID:    ${key.id}`);
  console.log(`Scopes: ${key.scopes.join(', ')}`);
  console.log(`Expires: ${key.expires_at || 'never'}`);
  console.log(`Token: ${key.token}`);
}
