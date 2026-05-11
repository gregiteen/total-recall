import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * verify.ts - Refactor Validator
 *
 * Usage: npx tsx scripts/refactor/verify.ts <originalFile> <newFile1> <newFile2> ...
 *
 * NOTE: Does NOT run tsc directly (too much RAM). Uses ESLint only.
 * For TS errors, check the [root]/typescript-fullrepo-errors.txt report.
 */

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("❌ Usage: npx tsx scripts/refactor/verify.ts <file1> <file2> ...");
  process.exit(1);
}

console.log("🛡️  Refactor Verification");
console.log("--------------------------------------------------------");

let success = true;

// 1. Check all files exist
console.log("📁 Checking files exist...");
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`  ❌ Not found: ${file}`);
    success = false;
  } else {
    const lines = fs.readFileSync(file, "utf-8").split("\n").length;
    const flag = lines > 500 ? "⚠️ " : "✅";
    console.log(`  ${flag} ${file} (${lines} lines)`);
  }
}

if (!success) process.exit(1);

// 2. Line count check — all output files should be under 500 lines
console.log("\n📏 Line count check (target: <500 lines each)...");
const [originalFile, ...newFiles] = files;
let lineCountOk = true;
for (const file of newFiles) {
  const lines = fs.readFileSync(file, "utf-8").split("\n").length;
  if (lines > 500) {
    console.warn(`  ⚠️  ${path.basename(file)}: ${lines} lines (over 500 — consider further splitting)`);
    lineCountOk = false;
  } else {
    console.log(`  ✅ ${path.basename(file)}: ${lines} lines`);
  }
}
if (!lineCountOk) {
  console.log("  💡 Some files are still over 500 lines. Consider splitting further.");
}

// 3. Ghost export check — warn if original still exports things that were supposed to move
console.log(`\n📝 Remaining exports in ${path.basename(originalFile)}:`);
const originalContent = fs.readFileSync(originalFile, "utf-8");
const exports = originalContent.match(/export (const|function|class|type|interface) (\w+)/g) || [];
if (exports.length > 0) {
  exports.forEach((exp) => console.log(`   - ${exp.replace("export ", "")}`));
} else {
  console.log("   (none — file is now a re-exporter or orchestrator only)");
}

// 4. Coupling check — find all files that still import from original
console.log(`\n🔗 Files importing from ${path.basename(originalFile)}:`);
try {
  const baseName = path.basename(originalFile, path.extname(originalFile));
  const result = execSync(
    `grep -rIl "${baseName}" src/ server/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v dist`,
    { encoding: "utf-8" }
  ).trim();
  if (result) {
    result.split("\n").forEach((f) => console.log(`   - ${f}`));
  } else {
    console.log("   (none)");
  }
} catch {
  console.log("   (grep unavailable)");
}

// 5. ESLint on all affected files
console.log("\n🔍 Running ESLint on affected files...");
try {
  execSync(`npx eslint ${files.join(" ")} --max-warnings=0`, { stdio: "inherit" });
  console.log("✅ ESLint passed.");
} catch {
  console.error("❌ ESLint found issues. Fix before considering refactor complete.");
  success = false;
}

console.log("\n--------------------------------------------------------");
if (success) {
  console.log("🎉 Refactor validation complete.");
  console.log("💡 Read typescript-fullrepo-errors.txt in Claude to check TS errors.");
} else {
  console.log("❌ Issues found. See above.");
}

process.exit(success ? 0 : 1);
