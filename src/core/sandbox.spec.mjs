import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInSandbox } from './sandbox.mjs';

describe('Sandbox Execution', () => {
  it('executes simple javascript and captures stdout', async () => {
    const tmpPath = path.join(os.tmpdir(), `sandbox-test-${Date.now()}.mjs`);
    fs.writeFileSync(tmpPath, `console.log("hello sandbox");`);
    
    const result = await runInSandbox(tmpPath, 2000);
    expect(result.success).toBe(true);
    expect(result.output).toContain('hello sandbox');
    
    fs.unlinkSync(tmpPath);
  });

  it('fails safely when syntax is invalid', async () => {
    const tmpPath = path.join(os.tmpdir(), `sandbox-test-${Date.now()}.mjs`);
    fs.writeFileSync(tmpPath, `const a = ;`);
    
    const result = await runInSandbox(tmpPath, 2000);
    expect(result.success).toBe(false);
    expect(result.output).toContain('SyntaxError');
    
    fs.unlinkSync(tmpPath);
  });

  it('prevents escape via timeout for infinite loops', async () => {
    const tmpPath = path.join(os.tmpdir(), `sandbox-test-${Date.now()}.mjs`);
    fs.writeFileSync(tmpPath, `while(true) {}`);
    
    const start = Date.now();
    const result = await runInSandbox(tmpPath, 500); // 500ms timeout
    const duration = Date.now() - start;
    
    expect(result.success).toBe(false);
    // process should be killed
    expect(duration).toBeGreaterThanOrEqual(400); // roughly 500ms
    
    fs.unlinkSync(tmpPath);
  });
});
