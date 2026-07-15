import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const globalVault = '/Users/greg/.agent/skills/total-recall/memory-vault';
const globalSessions = '/Users/greg/.agent/skills/total-recall/sessions';

const files = fs.readdirSync(path.join(globalVault, 'facts'));
for (const file of files) {
  if (!file.endsWith('.md')) continue;
  const content = fs.readFileSync(path.join(globalVault, 'facts', file), 'utf8');
  const parsed = matter(content);
  if (parsed.data.source && parsed.data.source.session_id) {
    console.log(file, parsed.data.source);
    const sessionId = parsed.data.source.session_id.replace(/^session:\/\//, '');
    const sessionFile = path.join(globalSessions, sessionId + '.md');
    if (fs.existsSync(sessionFile)) {
      const sessParsed = matter(fs.readFileSync(sessionFile, 'utf8'));
      console.log('  -> Project:', sessParsed.data.project);
    } else {
      console.log('  -> Session file not found:', sessionFile);
    }
    break;
  }
}
