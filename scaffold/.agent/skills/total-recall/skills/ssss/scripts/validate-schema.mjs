import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

/**
 * Validates a single SSSS Markdown file against schema rules
 */
export function validateNode(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(raw);
    const errors = [];

    if (!data.type) errors.push('Missing "type" property.');
    if (!data.slug) errors.push('Missing "slug" property.');
    if (!data.category) errors.push('Missing "category" property.');
    if (!data.title) errors.push('Missing "title" property.');
    
    if (data.schema_version !== 2) {
      errors.push(`Expected schema_version: 2, got: ${data.schema_version}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      file: filePath
    };
  } catch (err) {
    return {
      valid: false,
      errors: [err.message],
      file: filePath
    };
  }
}

if (import.meta.url.startsWith('file:')) {
  const runDirectly = process.argv[1] && process.argv[1].endsWith('validate-schema.mjs');
  if (runDirectly) {
    const target = process.argv[2];
    if (!target) {
      console.log('No file specified to validate.');
      process.exit(0);
    }
    const res = validateNode(path.resolve(target));
    if (res.valid) {
      console.log(`✅ SSSS node "${path.basename(target)}" is fully valid!`);
      process.exit(0);
    } else {
      console.error(`❌ Validation failed for "${path.basename(target)}":\n${res.errors.join('\n')}`);
      process.exit(1);
    }
  }
}
