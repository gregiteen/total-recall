import { loadKeys, issueKey, revokeKey } from '../server/keys.mjs';

function parseName(args, startIndex) {
  const positional = [];
  for (let i = startIndex; i < args.length; i++) {
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

function printHelp() {
  console.log(`
  total-recall key — Manage Personal Access Tokens (PATs) for outside integrations

  Usage: total-recall key <command> [options]

  Commands:
    list                      List all PATs
    create <name> [options]   Generate a new PAT
    revoke <id>               Revoke an existing PAT
    delete <id>               Alias for revoke
    rotate <id>               Revoke old PAT and generate a new one with same name/scopes

  Options for 'create':
    --scope <list>      Comma-separated scopes (default: *)
    --expires <date>    ISO date or relative days, e.g. 2026-06-01 or 30d
`);
}

export default async function keyCommand(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printHelp();
    return;
  }

  const command = args[0];

  if (command === 'list') {
    const keys = loadKeys();
    if (keys.length === 0) {
      console.log('No keys found.');
      return;
    }
    console.log(String('ID').padEnd(38) + String('NAME').padEnd(20) + String('PREFIX').padEnd(12) + String('STATUS').padEnd(10) + 'SCOPES');
    console.log('-'.repeat(100));
    for (const key of keys) {
      const isExpired = key.expires_at && new Date(key.expires_at).getTime() < Date.now();
      let status = key.revoked ? 'REVOKED' : (isExpired ? 'EXPIRED' : 'ACTIVE');
      console.log(
        String(key.id).padEnd(38) +
        String(key.name).slice(0, 18).padEnd(20) +
        String(key.token_prefix + '...').padEnd(12) +
        String(status).padEnd(10) +
        key.scopes.join(',')
      );
    }
    return;
  }

  if (command === 'create') {
    const name = parseName(args, 1);
    const key = issueKey(name, {
      scopes: parseScopes(args),
      expires_at: parseExpiresAt(args)
    });
    console.log(`Created new Personal Access Token for outside integrations:\n`);
    console.log(`Name:    ${key.name}`);
    console.log(`ID:      ${key.id}`);
    console.log(`Scopes:  ${key.scopes.join(', ')}`);
    console.log(`Expires: ${key.expires_at || 'never'}`);
    console.log(`\nToken:   ${key.token}\n`);
    console.log(`Make sure to copy this token now. You won't be able to see it again!`);
    return;
  }

  if (command === 'revoke' || command === 'delete') {
    const id = args[1];
    if (!id) {
      console.error('Error: Must provide key ID to revoke.');
      process.exit(1);
    }
    const revoked = revokeKey(id);
    if (revoked) {
      console.log(`Key ${id} ('${revoked.name}') has been revoked.`);
    } else {
      console.error(`Error: Key ${id} not found.`);
      process.exit(1);
    }
    return;
  }

  if (command === 'rotate') {
    const id = args[1];
    if (!id) {
      console.error('Error: Must provide key ID to rotate.');
      process.exit(1);
    }
    const keys = loadKeys();
    const existing = keys.find(k => k.id === id);
    if (!existing) {
      console.error(`Error: Key ${id} not found.`);
      process.exit(1);
    }
    
    // Revoke old
    revokeKey(id);
    
    // Issue new with same parameters
    const newKey = issueKey(existing.name, {
      scopes: existing.scopes,
      expires_at: existing.expires_at
    });
    
    console.log(`Rotated key '${existing.name}'. Old key revoked.`);
    console.log(`New ID:      ${newKey.id}`);
    console.log(`Scopes:      ${newKey.scopes.join(', ')}`);
    console.log(`Expires:     ${newKey.expires_at || 'never'}`);
    console.log(`\nNew Token:   ${newKey.token}\n`);
    console.log(`Make sure to copy this token now. You won't be able to see it again!`);
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
