import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function importHostModule(relative) {
  const root = process.env.TR_PACKAGE_ROOT;
  if (!root || !path.isAbsolute(root) || !/^src\/(core|cli|server)\/[A-Za-z0-9_./-]+\.mjs$/.test(relative) || relative.includes('..')) throw new Error('Explicit valid Total Recall host runtime required');
  return import(pathToFileURL(path.join(root, relative)).href);
}
