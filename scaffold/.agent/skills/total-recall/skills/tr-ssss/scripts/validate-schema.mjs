import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';

const APPEND_TYPES = new Set(['conversation', 'run']);
const CONTRACT_ONLY_TYPES = new Set(['operation', 'patch', 'lease']);
const V2_MEMORY_REQUIRED = [
  'confidence',
  'importance',
  'modality',
  'subject',
  'predicate',
  'object',
  'sentiment_polarity',
  'sentiment_target',
];

const FALLBACK_REQUIRED_BY_TYPE = {
  memory: ['slug', 'category', 'title', 'status', 'schema_version'],
  skill: ['name', 'description'],
  task: ['priority', 'category', 'status'],
  assistant: ['name'],
  workflow: ['name'],
  rule: ['name'],
  model: ['model_id', 'provider'],
  conversation: ['thread_id'],
  run: ['run_id', 'workflow_id'],
  conflict: ['conflict_id', 'status', 'new_slug', 'existing_slug', 'detected_at'],
  page: ['slug', 'name', 'sandbox_entry'],
  migration: ['migration_id', 'from_version', 'to_version', 'status', 'description'],
  release: ['release_id', 'version', 'schema_version', 'summary', 'released_at'],
  translation: ['title', 'description', 'timestamp', 'translation_id', 'source_path', 'source_hash', 'locale', 'status', 'translated_fields'],
};

let kernelPromise;

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'src/core/schema.mjs'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadKernel() {
  if (kernelPromise) return kernelPromise;

  kernelPromise = (async () => {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const roots = [process.cwd(), scriptDir]
      .map(findRepoRoot)
      .filter(Boolean);
    const repoRoot = roots[0];
    if (!repoRoot) return { repoRoot: null, schemas: null, validateMemoryNode: null };

    try {
      const schemaUrl = pathToFileURL(path.join(repoRoot, 'src/core/schema.mjs')).href;
      const validatorUrl = pathToFileURL(
        path.join(repoRoot, 'src/core/total-recall-memory-validator.mjs')
      ).href;
      const [{ SSSS_SCHEMAS }, { validateMemoryNode }] = await Promise.all([
        import(schemaUrl),
        import(validatorUrl),
      ]);
      return { repoRoot, schemas: SSSS_SCHEMAS, validateMemoryNode };
    } catch {
      return { repoRoot, schemas: null, validateMemoryNode: null };
    }
  })();

  return kernelPromise;
}

function formatZodIssues(error) {
  return (error?.issues || []).map((issue) => {
    const field = issue.path?.length ? issue.path.join('.') : '(root)';
    return `${field}: ${issue.message}`;
  });
}

function addMissingFieldErrors(errors, data, fields) {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push(`Missing required field '${field}'.`);
    }
  }
}

function validateFallback(data, errors, warnings) {
  if (!data.type) {
    errors.push('Missing required frontmatter field: type.');
    return;
  }

  if (typeof data.type !== 'string') {
    errors.push('Frontmatter field type must be a string.');
    return;
  }

  if (CONTRACT_ONLY_TYPES.has(data.type)) {
    errors.push(
      `Type '${data.type}' is a contract envelope type, not a Markdown document primitive.`
    );
    return;
  }

  const requiredFields = FALLBACK_REQUIRED_BY_TYPE[data.type];
  if (!requiredFields) {
    warnings.push(
      `No local fallback schema for type '${data.type}'. Implementation registry was unavailable.`
    );
    return;
  }

  addMissingFieldErrors(errors, data, requiredFields);
}

function validateMemoryV2(data, errors) {
  if (data.schema_version !== 2) {
    errors.push(`Expected memory schema_version: 2, got: ${data.schema_version}`);
    return;
  }
  addMissingFieldErrors(errors, data, V2_MEMORY_REQUIRED);
}

function validateMemoryPath(filePath, data, warnings) {
  const normalized = filePath.split(path.sep).join('/');
  if (!normalized.includes('/memory-vault/')) return;

  const parent = path.basename(path.dirname(filePath));
  if (data.category && parent !== data.category) {
    warnings.push(
      `Memory category '${data.category}' does not match parent directory '${parent}'.`
    );
  }
}

/**
 * Validates a single SSSS Markdown file against the Total Recall implementation
 * schema when available, with a scaffold-safe fallback for standalone installs.
 */
export async function validateNode(filePath) {
  const target = path.resolve(filePath);

  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = matter(raw);
    const data = parsed.data || {};
    const errors = [];
    const warnings = [];
    const kernel = await loadKernel();

    if (!raw.trimStart().startsWith('---')) {
      errors.push('Missing YAML frontmatter block.');
    }

    if (data.type && CONTRACT_ONLY_TYPES.has(data.type)) {
      errors.push(
        `Type '${data.type}' is a contract envelope type, not a Markdown document primitive.`
      );
    } else if (data.type === 'memory' && kernel.validateMemoryNode) {
      const result = kernel.validateMemoryNode(data);
      if (!result.success) errors.push(...result.errors);
    } else if (data.type && kernel.schemas?.[data.type]) {
      const result = kernel.schemas[data.type].safeParse(data);
      if (!result.success) errors.push(...formatZodIssues(result.error));
    } else {
      validateFallback(data, errors, warnings);
      if (data.type === 'memory') validateMemoryV2(data, errors);
    }

    if (APPEND_TYPES.has(data.type) && parsed.content.trim().length === 0) {
      warnings.push(`Append-type '${data.type}' has an empty body.`);
    }

    if (data.type === 'memory') validateMemoryPath(target, data, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      file: target,
      type: data.type || null,
    };
  } catch (err) {
    return {
      valid: false,
      errors: [err.message],
      warnings: [],
      file: target,
      type: null,
    };
  }
}

function realPathOrPath(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return value;
  }
}

const invokedPath = process.argv[1] ? realPathOrPath(path.resolve(process.argv[1])) : null;
const modulePath = realPathOrPath(fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node validate-schema.mjs <path-to-ssss-node.md>');
    process.exit(0);
  }

  const result = await validateNode(target);
  if (result.warnings.length > 0) {
    console.warn(`Warnings for ${path.basename(result.file)}:\n${result.warnings.join('\n')}`);
  }

  if (result.valid) {
    console.log(`OK: SSSS node "${path.basename(result.file)}" is valid.`);
    process.exit(0);
  }

  console.error(`FAIL: Validation failed for "${path.basename(result.file)}":\n${result.errors.join('\n')}`);
  process.exit(1);
}
