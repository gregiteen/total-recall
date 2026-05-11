import fs from "fs";

/**
 * analyze-file-structure.ts
 *
 * A simple script to help identify logical split points in large files.
 * Provides line counts for top-level blocks.
 */

const filePath = process.argv[2];

if (!filePath) {
  console.error("❌ Error: Please provide a file path to analyze.");
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ Error: File not found: ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, "utf-8");
const lines = content.split("\n");

console.log(`📊 Analyzing: ${filePath} (${lines.length} lines)`);
console.log("--------------------------------------------------------");

// Simple regex for top-level blocks
const patterns = [
  { name: "Class", regex: /^export (class|abstract class) (\w+)/ },
  { name: "Function", regex: /^export (async )?function (\w+)/ },
  { name: "Const Component/Hook", regex: /^export const (\w+)[:\s]=/ },
  { name: "Interface/Type", regex: /^export (interface|type) (\w+)/ },
];

let lastMatchLine = 0;
let lastMatchName = "Header/Imports";

lines.forEach((line, index) => {
  for (const pattern of patterns) {
    const match = line.match(pattern.regex);
    if (match) {
      const blockName = match[2];
      const lineCount = index - lastMatchLine;

      console.log(
        `${lastMatchName.padEnd(40)} | ${lineCount.toString().padStart(6)} lines`,
      );

      lastMatchLine = index;
      lastMatchName = `${pattern.name}: ${blockName}`;
      break;
    }
  }
});

// Print the last block
console.log(
  `${lastMatchName.padEnd(40)} | ${(lines.length - lastMatchLine).toString().padStart(6)} lines`,
);

console.log("--------------------------------------------------------");
console.log(
  "💡 Tip: Look for blocks > 300 lines as candidates for extraction.",
);
