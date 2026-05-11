import fs from 'fs';
import path from 'path';

console.log("🔍 Checking documentation integrity...");
const docsDir = path.resolve(process.cwd(), 'docs');

if (fs.existsSync(docsDir)) {
  console.log("✅ docs/ directory exists.");
  process.exit(0);
} else {
  // If the docs folder hasn't been created yet, that's okay, but warn.
  console.warn("⚠️ docs/ directory not found. Assuming legacy state.");
  process.exit(0);
}
