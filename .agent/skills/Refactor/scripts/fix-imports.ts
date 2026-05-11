import { execSync } from "child_process";
import fs from "fs";

/**
 * fix-imports.ts
 *
 * Searches for imports of a specific module and updates them to a new path.
 * Usage: npx ts-node scripts/refactor/fix-imports.ts <oldPathFragment> <newPathFragment>
 */

const [oldPath, newPath] = process.argv.slice(2);

if (!oldPath || !newPath) {
  console.error(
    "❌ Usage: npx ts-node fix-imports.ts <oldPathFragment> <newPathFragment>",
  );
  console.error(
    'Example: npx ts-node fix-imports.ts "@/services/AuthService" "@/services/auth/AuthService"',
  );
  process.exit(1);
}

console.log(
  `🔧 Searching for imports of "${oldPath}" to update to "${newPath}"...`,
);

try {
  // Use grep to find files containing the old path
  const findCommand = `grep -rIl "${oldPath}" src/ server/ --exclude-dir=node_modules --exclude-dir=dist`;
  const filesToUpdate = execSync(findCommand)
    .toString()
    .split("\n")
    .filter(Boolean);

  if (filesToUpdate.length === 0) {
    console.log("✅ No files found with the old import path.");
    process.exit(0);
  }

  console.log(`📝 Found ${filesToUpdate.length} files to update.`);

  filesToUpdate.forEach((file) => {
    const content = fs.readFileSync(file, "utf-8");
    // Simple regex replacement for import paths
    // We look for the path inside quotes
    const updatedContent = content.replace(
      new RegExp(`(['"])${oldPath}(['"])`, "g"),
      `$1${newPath}$2`,
    );

    if (content !== updatedContent) {
      fs.writeFileSync(file, updatedContent);
      console.log(`   ✅ Updated: ${file}`);
    }
  });

  console.log("--------------------------------------------------------");
  console.log("🎉 Project-wide import update complete.");
} catch {
  console.error("❌ Failed to find or update files. Ensure grep is available.");
  process.exit(1);
}
