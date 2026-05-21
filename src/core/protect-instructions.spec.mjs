import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import matter from 'gray-matter';
import { protectIDEInstructions } from './protect-instructions.mjs';

describe('protect-instructions core', () => {
  const tmpDir = path.join(os.tmpdir(), `tr-protect-instructions-test-${Date.now()}`);
  const vaultDir = path.join(tmpDir, 'memory-vault');
  const derivedDir = path.join(tmpDir, 'memory-derived');
  const instructionsFile = path.join(tmpDir, 'INSTRUCTIONS.md');

  let originalCwd;

  beforeEach(() => {
    originalCwd = process.cwd();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(vaultDir, { recursive: true });
    fs.mkdirSync(derivedDir, { recursive: true });
    process.chdir(tmpDir);
  });

  afterEach(() => {
    if (originalCwd) {
      process.chdir(originalCwd);
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('captures manual instruction edits with custom headings and blockquotes', () => {
    // 1. Write the pristine system-compiled instructions backup file
    const systemContent = `
# Tier 1 Invariants (Total Recall Hot Memory)
> This file is compiled automatically. Do not edit directly.

## ⚡ Before You Respond
1. Do not violate system boundaries.
2. Read skills when required.

## 🧠 Total Recall System
This is local sovereign memory.
`.trim();

    fs.writeFileSync(path.join(derivedDir, 'INSTRUCTIONS.system.md'), systemContent, 'utf8');

    // 2. Write the user/model modified INSTRUCTIONS.md with new custom rules (headings & blockquotes)
    const userContent = `
# Tier 1 Invariants (Total Recall Hot Memory)
> This file is compiled automatically. Do not edit directly.

## ⚡ Before You Respond
1. Do not violate system boundaries.
2. Read skills when required.

## 🧠 Total Recall System
This is local sovereign memory.

# 🔒 Custom User Heading
Here is a normal paragraph about rules.

> [!IMPORTANT]
> This is a custom blockquote that should be captured perfectly!
- Custom bullet point 1
- Custom bullet point 2
`.trim();

    fs.writeFileSync(instructionsFile, userContent, 'utf8');

    // 3. Execute protectIDEInstructions
    const result = protectIDEInstructions({ vaultDir, derivedDir, instructionsFile });

    expect(result.imported).toBe(1);
    expect(result.slugs.length).toBe(1);

    const slug = result.slugs[0];
    const nodeFile = path.join(vaultDir, 'invariants', `${slug}.md`);
    expect(fs.existsSync(nodeFile)).toBe(true);

    // 4. Parse the generated memory node to verify it retains headings & blockquotes
    const fileText = fs.readFileSync(nodeFile, 'utf8');
    const { data, content } = matter(fileText);

    expect(data.type).toBe('memory');
    expect(data.slug).toBe(slug);
    expect(data.category).toBe('invariants');
    expect(data.priority).toBe('absolute');
    expect(data.modality).toBe('must');
    expect(data.importance).toBe('critical');

    const cleanBody = content.trim();
    expect(cleanBody).toContain('# 🔒 Custom User Heading');
    expect(cleanBody).toContain('Here is a normal paragraph about rules.');
    expect(cleanBody).toContain('> [!IMPORTANT]');
    expect(cleanBody).toContain('> This is a custom blockquote that should be captured perfectly!');
    expect(cleanBody).toContain('- Custom bullet point 1');
    expect(cleanBody).toContain('- Custom bullet point 2');
  });
});
