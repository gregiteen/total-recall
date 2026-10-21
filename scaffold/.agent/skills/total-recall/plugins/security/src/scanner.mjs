import fs from 'node:fs';
import path from 'node:path';

// Findings contain locations and rule identifiers only, never matched source or values.
export function scanSource(targetPath) {
  const root = fs.realpathSync(path.resolve(targetPath));
  const findings = [];
  const skipped = new Set(['node_modules', '.git', 'dist', 'coverage', 'memory-vault', '.cache', '.venv', '__pycache__']);
  let count = 0;
  function visit(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      findings.push({ file: path.relative(root, file), line: 0, rule: 'uninspected-symlink', severity: 'HIGH', detail: 'Linked source was not inspected; coverage incomplete' });
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) if (!skipped.has(name)) visit(path.join(file, name));
      return;
    }
    if (!stat.isFile() || !/\.(?:[cm]?js|tsx?|py|sh|bash|ps1|json|env|ya?ml)$|(?:^|\/)\.env(?:\.|$)/.test(file)) return;
    if (++count > 20000 || stat.size > 2097152) throw new Error('Scan coverage limit exceeded; narrow the target');
    const testFile = /(?:^|\/)(?:test|tests|fixtures)(?:\/|$)|\.(?:test|spec)\./.test(file);
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const rules = [];
      if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
      if (!testFile && /(?:process\.env|\benv)\s*\[\s*(?:key|name|secretRef|TOKEN_KEY|API_KEY_ENV)\s*\]/.test(line)) rules.push(['dynamic-credential-source-review', 'HIGH']);
      if (!testFile && /(?:fallback_(?:geo|rev|place|route)|tr-tickets-default-secret)/.test(line)) rules.push(['synthetic-provider-or-signing-default', 'HIGH']);
      if (/\beval\s*\(|new\s+Function\s*\(/.test(line)) rules.push(['code-evaluation', 'CRITICAL']);
      if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][\w+/=-]{16,}['"]/i.test(line)) rules.push(['embedded-credential', 'HIGH']);
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)) rules.push(['private-key-material', 'CRITICAL']);
      if (!testFile && /process\.env(?:\.[A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\b|\[['"][A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)['"]\])/.test(line)) rules.push(['ambient-credential-bypass-review', 'HIGH']);
      if (!testFile && /os\.(?:getenv\(\s*|environ(?:\.get\(\s*|\[\s*))['"][A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)['"]/.test(line)) rules.push(['python-ambient-credential-review', 'HIGH']);
      if (!testFile && /\.(?:sh|bash|ps1)$/.test(file) && /\$(?:env:|\{)?[A-Z_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\b/.test(line)) rules.push(['shell-ambient-credential-review', 'HIGH']);
      if (!testFile && /(?:from\s*|import\s*\()\s*['"][^'"]*total-recall[^'"]*\/(?:secrets-store|secrets-gateway|crypto)\.mjs/.test(line)) rules.push(['core-secret-ownership', 'HIGH']);
      if (!testFile && /(?:secret|passphrase|password).*(?:\|\||\?\?).*['"][^'"]+['"]/i.test(line)) rules.push(['credential-default-review', 'HIGH']);
      for (const [rule, severity] of rules) findings.push({ file: path.relative(root, file) || path.basename(file), line: index + 1, rule, severity, detail: 'Review owning source; matched content withheld' });
    });
  }
  visit(root);
  return findings;
}
