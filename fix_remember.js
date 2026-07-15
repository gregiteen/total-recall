const fs = require('fs');
let content = fs.readFileSync('src/cli/remember.mjs', 'utf8');

// Fix the scoping of project
content = content.replace("    const project = getBothBrains().project;", "    // const project moved up");
content = content.replace("  let layer = explicitLayer;", "  let layer = explicitLayer;\n  const project = getBothBrains().project;");

fs.writeFileSync('src/cli/remember.mjs', content, 'utf8');
