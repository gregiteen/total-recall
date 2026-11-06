import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const HOST_RUNTIME_REQUIRED = 'Explicit valid Total Recall host runtime required';
export function importHostModule(relative) {
  const root = process.env.TR_PACKAGE_ROOT;
  if (!root || !path.isAbsolute(root) || !/^src\/(core|cli|server)\/[A-Za-z0-9_./-]+\.mjs$/.test(relative) || relative.includes('..')) throw new Error(HOST_RUNTIME_REQUIRED);
  return import(pathToFileURL(path.join(root, relative)).href);
}
