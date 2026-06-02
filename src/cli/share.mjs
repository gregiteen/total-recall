import crypto from 'node:crypto';
import { parseLayerFlag, resolveBrainDir, getBothBrains, defaultLayerForCategory } from './agent-dir.mjs';
import { createMemoryNode } from '../core/vault.mjs';
import { writeNodeValidated } from '../core/validated-write.mjs';
import { addToQueue } from '../core/research-queue.mjs';
import { compileSurface } from '../core/surface.mjs';
import path from 'node:path';

function printHelp() {
  console.log(`
  total-recall share — Share a URL or text snippet to the brain

  Usage: total-recall share [url] [options]

  Arguments:
    url                     URL to share (optional if --text is provided)

  Options:
    --text, -x <text>       Text excerpt to remember
    --action, -a <action>   remember | research | auto (default: auto)
    --tags, -t <comma-list> Comma-separated tags
    --brain, -b <brainId>   Target brain ID
    --title <title>         Custom title for the memory node
    --global                Save to global brain
    --project               Save to project brain

  Auto-routing heuristic (when action is 'auto'):
    - URL + no text         → queues research project
    - Text < 500 chars      → saves as fact
    - Text >= 500 chars     → saves as concept
    - URL + text            → saves as fact/concept with URL citation

  Examples:
    npx total-recall share "https://example.com"
    npx total-recall share "https://example.com" --text "Key insight from the article"
    npx total-recall share --text "Important fact to remember" --tags "work,notes"
    npx total-recall share "https://example.com" --action research
`);
}

/**
 * Resolve the effective action from the auto-routing heuristic.
 */
function resolveAction({ url, text, action }) {
  if (action && action !== 'auto') {
    if (action === 'remember') {
      const category = text && text.length >= 500 ? 'concepts' : 'facts';
      return { action: 'remember', category };
    }
    return { action, category: null };
  }

  if (url && !text) {
    return { action: 'research', category: null };
  }
  if (text && text.length >= 500) {
    return { action: 'remember', category: 'concepts' };
  }
  if (text) {
    return { action: 'remember', category: 'facts' };
  }
  if (url) {
    return { action: 'research', category: null };
  }
  return { action: 'remember', category: 'facts' };
}

export default async function share(args) {
  const { layer: explicitLayer, remainingArgs } = parseLayerFlag(args);

  // Parse positional URL and options
  let url = null;
  let text = null;
  let action = 'auto';
  let tags = [];
  let brainId = null;
  let title = null;

  for (let i = 0; i < remainingArgs.length; i++) {
    const arg = remainingArgs[i];
    const val = remainingArgs[i + 1];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      return;
    } else if (arg === '--text' || arg === '-x') {
      if (val) { text = val; i++; }
    } else if (arg === '--action' || arg === '-a') {
      if (val) { action = val.toLowerCase(); i++; }
    } else if (arg === '--tags' || arg === '-t') {
      if (val) { tags = val.split(',').map(t => t.trim()); i++; }
    } else if (arg === '--brain' || arg === '-b') {
      if (val) { brainId = val; i++; }
    } else if (arg === '--title') {
      if (val) { title = val; i++; }
    } else if (!arg.startsWith('-') && !url) {
      // First positional arg is the URL
      url = arg;
    }
  }

  if (!url && !text) {
    printHelp();
    return;
  }

  const { action: resolvedAction, category } = resolveAction({ url, text, action });

  if (resolvedAction === 'research') {
    const topic = title || url || 'Untitled research';
    const item = addToQueue({
      topic,
      priority: 'medium',
      notes: text || '',
    });
    console.log(`  ✅ Queued research: "${topic}" (id: ${item.id})`);
    return;
  }

  // action === 'remember'
  let layer = explicitLayer;
  if (layer === 'auto') {
    layer = defaultLayerForCategory(category || 'facts');
    const project = getBothBrains().project;
    if (layer === 'project' && !project) {
      layer = 'global';
    }
  }

  const resolvedBrainDir = resolveBrainDir(layer);
  const vaultDir = path.join(resolvedBrainDir, 'memory-vault');
  const skillsDir = path.join(resolvedBrainDir, '..', '..');
  const derivedDir = path.join(resolvedBrainDir, 'memory-derived');
  const instructionsFile = path.join(skillsDir, '..', 'INSTRUCTIONS.md');

  const slugBase = category || 'facts';
  const slug = `${slugBase}-${crypto.randomBytes(4).toString('hex')}`;
  const nodeTitle = title || (text ? text.slice(0, 80) : url || 'Untitled share');

  const node = createMemoryNode({
    slug,
    title: nodeTitle,
    category: category || 'facts',
    content: text || url || '',
  });

  node.source.type = 'share-cli';

  if (tags.length > 0) {
    node.tags = tags;
  }

  if (url) {
    node.x_citations = [{
      url,
      title: title || url,
      source: 'share-to-brain',
      published: node.created,
      relevance: 1.0,
      accessed: node.created,
    }];
  }

  const vaultResult = writeNodeValidated(node, vaultDir);
  if (!vaultResult.success) {
    console.error(`  ❌ Validation failed: ${vaultResult.validation.errors.join('; ')}`);
    process.exit(1);
  }
  const layerLabel = layer === 'project' ? '[project]' : '[global]';
  console.log(`  ✅ Saved as ${category || 'facts'} ${layerLabel}: ${category || 'facts'}/${slug}.md`);

  // Recompile surfaces
  console.log('  ⏳ Recompiling active memory surfaces and indexes...');
  try {
    const compileResult = await compileSurface({
      vaultDir,
      skillsDir,
      derivedDir,
      instructionsFile,
    });
    console.log(`  ✅ Recompilation successful! Processed ${compileResult.nodesProcessed} SSSS nodes.`);
  } catch (err) {
    console.warn(`  ⚠️  Memory saved, but surface recompilation failed: ${err.message}`);
  }
}
