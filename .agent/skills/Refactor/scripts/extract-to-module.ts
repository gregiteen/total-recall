import fs from "fs";
import path from "path";

/**
 * extract-to-module.ts
 *
 * Automates the extraction of a code block to a new file.
 * Usage: npx ts-node scripts/refactor/extract-to-module.ts <sourceFile> <startLine> <endLine> <targetFile>
 */

const [sourceFile, startLineStr, endLineStr, targetFile] =
  process.argv.slice(2);

if (!sourceFile || !startLineStr || !endLineStr || !targetFile) {
  console.error(
    "❌ Usage: npx ts-node extract-to-module.ts <sourceFile> <startLine> <endLine> <targetFile>",
  );
  process.exit(1);
}

const startLine = parseInt(startLineStr, 10);
const endLine = parseInt(endLineStr, 10);

if (isNaN(startLine) || isNaN(endLine)) {
  console.error("❌ Error: startLine and endLine must be numbers.");
  process.exit(1);
}

if (!fs.existsSync(sourceFile)) {
  console.error(`❌ Source file not found: ${sourceFile}`);
  process.exit(1);
}

const sourceContent = fs.readFileSync(sourceFile, "utf-8");
const lines = sourceContent.split("\n");

// 1-indexed to 0-indexed
const extractedLines = lines.slice(startLine - 1, endLine);
const remainingLinesBefore = lines.slice(0, startLine - 1);
const remainingLinesAfter = lines.slice(endLine);

const extractedContent = extractedLines.join("\n");

// 1. Write the new file
const targetDir = path.dirname(targetFile);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.writeFileSync(targetFile, extractedContent);
console.log(`✅ Extracted block to: ${targetFile}`);

// 2. Update the source file with an import
// We attempt to find the last import to append the new one
const importPath = path
  .relative(path.dirname(sourceFile), targetFile)
  .replace(/\.tsx?$|\.jsx?$/, "");
const formattedImportPath = importPath.startsWith(".")
  ? importPath
  : `./${importPath}`;

// Basic heuristic: find the name of the exported item in the extracted content
const exportMatch = extractedContent.match(
  /export (const|function|class|type|interface) (\w+)/,
);
const exportName = exportMatch ? exportMatch[2] : null;

if (exportName) {
  const newImportLine = `import { ${exportName} } from '${formattedImportPath}';`;

  // Find insertion point (after last import)
  let lastImportIndex = -1;
  remainingLinesBefore.forEach((line, i) => {
    if (line.startsWith("import ")) lastImportIndex = i;
  });

  if (lastImportIndex !== -1) {
    remainingLinesBefore.splice(lastImportIndex + 1, 0, newImportLine);
  } else {
    remainingLinesBefore.unshift(newImportLine);
  }

  const newSourceContent = [
    ...remainingLinesBefore,
    ...remainingLinesAfter,
  ].join("\n");
  fs.writeFileSync(sourceFile, newSourceContent);
  console.log(
    `✅ Updated ${path.basename(sourceFile)} with import of ${exportName}.`,
  );
  console.log(
    `💡 Note: You may need to manually move other shared types or imports to the new file.`,
  );
} else {
  console.warn(
    "⚠️  Could not identify export name. Import not added to source file.",
  );
}
