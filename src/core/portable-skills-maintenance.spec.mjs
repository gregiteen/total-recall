import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { maintainPortableSkills } from './portable-skills-maintenance.mjs';
import { registerSkill } from './skills-registry.mjs';

describe('portable skill maintenance', () => {
  it('does not execute an unenrolled source', async () => {
    const brainDir=fs.mkdtempSync(path.join(os.tmpdir(),'tr-portable-'));
    const run=vi.fn();
    try { expect(await maintainPortableSkills({brainDir,run})).toMatchObject({skipped:true,failed:0}); expect(run).not.toHaveBeenCalled(); }
    finally { fs.rmSync(brainDir,{recursive:true,force:true}); }
  });
  it('retains helper failures and rejects malformed output', async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'tr-portable-'));
    const brainDir=path.join(root,'brain'), source=path.join(root,'ssss');
    fs.mkdirSync(path.join(source,'core/scripts'),{recursive:true});
    fs.writeFileSync(path.join(source,'SKILL.md'),'---\nname: ssss\ndescription: portable\n---\n');
    fs.writeFileSync(path.join(source,'core/scripts/maintain.mjs'),'// source-owned helper\n');
    registerSkill(brainDir,source,{source_type:'portable-owner-package'});
    try {
      const run=vi.fn().mockResolvedValue({code:1,output:JSON.stringify({failed:2,results:[{status:'error'}]})});
      expect(await maintainPortableSkills({brainDir,run})).toMatchObject({failed:2,results:[{status:'error'}]});
      expect(run.mock.calls[0][1]).toContain('--apply');
      run.mockResolvedValue({code:0,output:'not JSON'});
      expect(await maintainPortableSkills({brainDir,run})).toMatchObject({failed:1});
    } finally { fs.rmSync(root,{recursive:true,force:true}); }
  });
});
