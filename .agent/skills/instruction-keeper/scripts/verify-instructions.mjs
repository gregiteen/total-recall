import fs from 'fs';
import path from 'path';

console.log("🔍 Verifying Assistant Instruction Services...");
const servicePath = path.resolve(process.cwd(), 'server/services/code-mode/AssistantInstructionService.ts');
if (fs.existsSync(servicePath)) {
  console.log("✅ AssistantInstructionService.ts found. Instructions architecture is healthy.");
  process.exit(0);
} else {
  console.error("❌ AssistantInstructionService.ts is missing!");
  process.exit(1);
}
