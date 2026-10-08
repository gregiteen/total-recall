// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { restoreLegacyInitSecrets } from './legacy-init-secrets.mjs';
import { loadSecrets } from './secrets-gateway.mjs';

describe('legacy initialization credential preservation', () => {
  let root,brain,previous,previousMaster;
  beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-init-credentials-'));brain=path.join(root,'skills','total-recall');previous=process.env.TR_SECRETS_PASSWORD;previousMaster=process.env.TR_MASTER_PASSWORD;delete process.env.TR_SECRETS_PASSWORD;delete process.env.TR_MASTER_PASSWORD;});
  afterEach(()=>{vi.restoreAllMocks();if(previous===undefined)delete process.env.TR_SECRETS_PASSWORD;else process.env.TR_SECRETS_PASSWORD=previous;if(previousMaster===undefined)delete process.env.TR_MASTER_PASSWORD;else process.env.TR_MASTER_PASSWORD=previousMaster;fs.rmSync(root,{recursive:true,force:true});});
  it('preserves a store created concurrently during asynchronous encryption',async()=>{
    process.env.TR_SECRETS_PASSWORD='synthetic-only-init-password';
    fs.writeFileSync(path.join(root,'secrets.enc'),'{"key":"synthetic legacy value"}');
    const link=fs.linkSync;
    vi.spyOn(fs,'linkSync').mockImplementationOnce((source,destination)=>{
      fs.writeFileSync(destination,'concurrent active encrypted fixture');
      return link(source,destination);
    });
    expect(await restoreLegacyInitSecrets(root,brain)).toEqual({restored:false,reason:'active-store-exists'});
    expect(fs.readFileSync(path.join(brain,'config','secrets.enc'),'utf8')).toBe('concurrent active encrypted fixture');
    expect(fs.readdirSync(path.join(brain,'config'))).toEqual(['secrets.enc']);
  });
  it('preserves an existing active store byte-for-byte even with a conflicting legacy carrier',async()=>{
    fs.mkdirSync(path.join(brain,'config'),{recursive:true});const active=path.join(brain,'config','secrets.enc');
    fs.writeFileSync(active,'existing encrypted fixture bytes');fs.writeFileSync(path.join(root,'secrets.enc'),'{"key":"legacy fixture"}');
    expect(await restoreLegacyInitSecrets(root,brain)).toEqual({restored:false,reason:'active-store-exists'});
    expect(fs.readFileSync(active,'utf8')).toBe('existing encrypted fixture bytes');
  });
  it('fails closed without a password and never writes plaintext credentials',async()=>{
    fs.writeFileSync(path.join(root,'secrets.enc'),'{"key":"synthetic value"}');
    await expect(restoreLegacyInitSecrets(root,brain)).rejects.toThrow();
    expect(fs.existsSync(path.join(brain,'config','secrets.enc'))).toBe(false);
  });
  it('encrypts a legacy JSON carrier, removes the dashboard hash and protects file permissions',async()=>{
    process.env.TR_SECRETS_PASSWORD='synthetic-only-init-password';
    fs.writeFileSync(path.join(root,'secrets.enc'),JSON.stringify({key:'synthetic value',dashboard_password_hash:'synthetic hash'}));
    expect(await restoreLegacyInitSecrets(root,brain)).toMatchObject({restored:true,dashboardPasswordHash:'synthetic hash'});
    expect(await loadSecrets(brain)).toEqual({key:'synthetic value'});
    const file=path.join(brain,'config','secrets.enc');expect(fs.readFileSync(file).includes(Buffer.from('synthetic value'))).toBe(false);
    expect(fs.statSync(file).mode&0o077).toBe(0);
  });
});
