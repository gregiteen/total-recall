import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

// The inputs look like:
// <input
//   id="google_api_key"
//   type="password"
// ...
// />

// Replace each one
const keys = ['google_api_key', 'anthropic_api_key', 'openai_api_key', 'openrouter_api_key'];

for (const key of keys) {
  const startRegex = new RegExp(`<input\\s+id="${key}"`, 'g');
  content = content.replace(startRegex, `<form onSubmit={e => e.preventDefault()} style={{display:'inline',margin:0,padding:0,width:'100%'}}><input id="${key}"`);
  
  const endRegex = new RegExp(`(onChange=\\{\\(e\\) => updateSecretsProp\\('${key}', e\\.target\\.value\\)\\}\\s*style=\\{\\{[\\s\\S]*?\\}\\}\\s*\\/>)`);
  content = content.replace(endRegex, '$1</form>');
}

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
