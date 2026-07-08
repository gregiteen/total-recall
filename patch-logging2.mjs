import fs from 'fs';
let content = fs.readFileSync('src/server/rest.mjs', 'utf8');
content = content.replace(/\} catch \(err\) \{\n\s*res\.status\(500\)\.json\(\{ error: err\.message \}\);\n\s*\}/g, '} catch (err) {\n    console.error("API ERROR:", err);\n    res.status(500).json({ error: err.message });\n  }');
fs.writeFileSync('src/server/rest.mjs', content);
