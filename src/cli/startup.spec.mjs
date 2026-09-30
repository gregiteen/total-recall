import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../core/startup-health.mjs', () => ({ startupHealth: vi.fn(async () => ({ ready: true, server: {status:'ready'},brain:{status:'ready'},daemon:{status:'running'},ssss:{status:'available'},app:{status:'not-declared'},actions:[] })) }));
import startup, { inspectStartup } from './startup.mjs';
import { startupHealth } from '../core/startup-health.mjs';
describe('startup CLI contract', () => {
  let log;
  beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => {}); vi.clearAllMocks(); process.exitCode = undefined; });
  afterEach(() => { log.mockRestore(); process.exitCode = undefined; });
  it('help returns without probing', async () => { await startup(['--help']); expect(startupHealth).not.toHaveBeenCalled(); expect(log).toHaveBeenCalled(); });
  it('invalid options never start anything', async () => { await expect(startup(['bogus'])).rejects.toThrow(); await expect(startup(['ensure','--app-start','run-app'])).rejects.toThrow(); await expect(startup(['check','--unknown'])).rejects.toThrow(); expect(startupHealth).not.toHaveBeenCalled(); });
  it('check is read-only and ensure explicit', async () => { await startup(['check','--json']); expect(startupHealth.mock.calls[0][0].ensure).toBe(false); await startup(['ensure','--app-check','app-health','--app-start','app-launch']); expect(startupHealth.mock.calls[1][0]).toMatchObject({ensure:true,appCheck:'app-health',appStart:'app-launch'}); });
  it('unready JSON fails exit status without leaking raw payload', async () => { startupHealth.mockResolvedValueOnce({ready:false}); await startup(['check','--json']); expect(process.exitCode).toBe(1); expect(JSON.parse(log.mock.calls[0][0])).toEqual({ready:false}); });
  it('configured override options are passed to core', async () => { await inspectStartup({brainUrl:null,token:null}); expect(startupHealth.mock.calls[0][0]).toMatchObject({brainUrl:null,token:null}); });
});
