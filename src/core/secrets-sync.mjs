import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getLeaderInfo, isLeader } from './leader-election.mjs';
import { logger } from './logger.mjs';
import { agentDir } from './config.mjs';

const SECRETS_FILE = path.join(agentDir, 'secrets.enc');

export function getSecretsChecksum() {
  if (!fs.existsSync(SECRETS_FILE)) return null;
  const content = fs.readFileSync(SECRETS_FILE);
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex');
}

export async function pullSecretsFromLeader(leaderIp) {
  try {
    const res = await fetch(`http://${leaderIp}:3100/api/secrets/sync`);
    if (!res.ok) {
      throw new Error(`Failed to pull secrets: ${res.status}`);
    }
    const data = await res.arrayBuffer();
    fs.writeFileSync(SECRETS_FILE, Buffer.from(data));
    logger.info({ subsystem: 'secrets-sync', message: 'Successfully pulled secrets.enc from leader' });
    return true;
  } catch (err) {
    logger.error({ subsystem: 'secrets-sync', message: `Error pulling secrets: ${err.message}` });
    return false;
  }
}

export async function syncLoop() {
  if (await isLeader()) return; // Leader does not pull

  const leaderInfo = await getLeaderInfo();
  if (!leaderInfo || !leaderInfo.ip) return;

  try {
    const res = await fetch(`http://${leaderInfo.ip}:3100/api/secrets/checksum`);
    if (!res.ok) return;
    
    const { checksum } = await res.json();
    const localChecksum = getSecretsChecksum();
    
    if (checksum && checksum !== localChecksum) {
      logger.info({ subsystem: 'secrets-sync', message: 'Secrets checksum mismatch. Pulling from leader...' });
      await pullSecretsFromLeader(leaderInfo.ip);
    }
  } catch (err) {
    logger.error({ subsystem: 'secrets-sync', message: `Failed to check leader secrets checksum: ${err.message}` });
  }
}
