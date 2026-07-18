import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger.mjs';

/**
 * Automatically detects direct manual additions/modifications to any compiled
 * instruction files or shims in the active IDE workspace or agent directory.
 * Converts any custom additions into permanent SSSS memory vault invariants
 * with priority: absolute and modality: must, ensuring they are never overwritten.
 *
 * @param {object} params
 * @param {string} params.vaultDir
 * @param {string} params.derivedDir
 * @param {string} params.instructionsFile
 * @returns {{ imported: number, slugs: string[] }}
 */
export function protectIDEInstructions({ vaultDir, derivedDir, instructionsFile }) {
  try {
    const backupFile = path.join(derivedDir, 'INSTRUCTIONS.system.md');

    // If no backup of system-compiled instructions exists, we cannot perform diff analysis
    if (!fs.existsSync(backupFile)) {
      return { imported: 0, slugs: [] };
    }

    const systemContent = fs.readFileSync(backupFile, 'utf8').trim();
    if (!systemContent) {
      return { imported: 0, slugs: [] };
    }

    const systemLinesSet = new Set(systemContent.split('\n').map(l => l.trim()));

    // Collect possible instruction/shim files in both compile target and active workspace cwd
    const candidates = [
      instructionsFile,
      path.join(process.cwd(), 'INSTRUCTIONS.md'),
      path.join(process.cwd(), '.cursorrules'),
      path.join(process.cwd(), 'GEMINI.md'),
      path.join(process.cwd(), 'CLAUDE.md'),
      path.join(process.cwd(), '.clauderules'),
      path.join(process.cwd(), '.clinerules'),
      path.join(process.cwd(), '.clinerules', 'total-recall.md'),
      path.join(process.cwd(), 'AGENTS.md'),
      path.join(process.cwd(), 'WINDSURF.md'),
      path.join(process.cwd(), '.windsurfrules')
    ];

    // Resolve symbolic links to obtain unique real file paths
    const uniquePaths = new Set();
    for (const f of candidates) {
      if (!fs.existsSync(f)) continue;
      try {
        const real = fs.realpathSync(f);
        uniquePaths.add(real);
      } catch {
        uniquePaths.add(path.resolve(f));
      }
    }

    const importedSlugs = [];

    for (const file of uniquePaths) {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8').trim();
      } catch {
        continue;
      }

      if (!content || content === systemContent) {
        continue;
      }

      // Split by line to identify manual additions
      const currentLines = content.split('\n').map(l => l.trim());
      const newLines = [];

      for (const line of currentLines) {
        if (!line) continue;

        // Skip lines that exist in the system-generated template
        if (systemLinesSet.has(line)) continue;

        // Skip comments and tables, but preserve custom headers and blockquotes
        if (line.startsWith('<!--')) continue;
        if (line.includes('BEGIN INJECTED MEMORY') || line.includes('END INJECTED MEMORY')) continue;
        if (line.startsWith('|') && line.includes('Topic')) continue; // Table header
        if (line.startsWith('|') && line.includes('---')) continue; // Table separator
        if (line.startsWith('|') && line.includes('.md')) continue; // Table row

        newLines.push(line);
      }

      if (newLines.length === 0) {
        continue;
      }

      // Group manual rules and create a stable node slug using text hash
      const cleanInstructionText = newLines.join('\n');
      const contentHash = crypto.createHash('sha256').update(cleanInstructionText).digest('hex').slice(0, 8);
      const slug = `inviolable-ide-instruction-${contentHash}`;

      const nodeFile = path.join(vaultDir, 'invariants', `${slug}.md`);

      // If the node already exists, we do not duplicate it
      if (fs.existsSync(nodeFile)) {
        continue;
      }

      // Ensure invariants folder exists
      fs.mkdirSync(path.join(vaultDir, 'invariants'), { recursive: true });

      const firstLineClean = newLines[0]
        .replace(/^[-*•+\d.]\s+/, '') // strip bullet markers
        .replace(/"/g, '\\"')
        .slice(0, 50);

      const nodeContent = `---
type: memory
slug: ${slug}
title: "Inviolable IDE Instruction: ${firstLineClean}"
category: invariants
status: active
priority: absolute
modality: must
confidence: 1.0
importance: critical
tags:
  - inviolable
  - ide-edit
created: "${new Date().toISOString()}"
updated: "${new Date().toISOString()}"
---

${cleanInstructionText}
`;

      fs.writeFileSync(nodeFile, nodeContent, 'utf8');
      importedSlugs.push(slug);

      logger.info('kernel', `Auto-captured manual IDE instruction edit in ${path.basename(file)}! Promoted new rule to canonical invariant: ${slug}`);
    }

    return { imported: importedSlugs.length, slugs: importedSlugs };
  } catch (err) {
    logger.error('kernel', `Failed to run IDE instruction protection check: ${err.message}`);
    return { imported: 0, slugs: [] };
  }
}
