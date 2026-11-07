import path from 'node:path';

const DEFAULT_PERMISSIONS = Object.freeze({ read: true, write: false, send: false, destructive: false });
export { DEFAULT_PERMISSIONS };

export function commandPermissions(value = DEFAULT_PERMISSIONS) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Command permissions must be boolean values');
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(DEFAULT_PERMISSIONS, key) || typeof value[key] !== 'boolean') throw new Error(`Invalid permission ${key}`);
  }
  return { ...DEFAULT_PERMISSIONS, ...value };
}

const PUBLIC_FIELDS = [
  'agent', 'cwd', 'prompt', 'permissions', 'node', 'allowUnknownAuth', 'timeoutMs',
  'model', 'tools', 'settingSources', 'allowedTools',
];

export function validateDispatchRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Dispatch requires a JSON object');
  if (Object.keys(request).some(key => !PUBLIC_FIELDS.includes(key))) throw new Error('Unsupported dispatch field; workspace context and containment are managed by Meta Harness');
  if (typeof request.agent !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(request.agent) ||
      typeof request.cwd !== 'string' || !path.isAbsolute(request.cwd) || request.cwd.includes('\0') ||
      typeof request.prompt !== 'string' || !request.prompt.trim() || Buffer.byteLength(request.prompt) > 65536) {
    throw new Error('Dispatch requires an explicit agent, absolute workspace, and bounded nonempty prompt');
  }
  if (request.node !== undefined && (typeof request.node !== 'string' || !request.node.trim() || /[\0\r\n]/.test(request.node))) throw new Error('Invalid dispatch node');
  if (request.allowUnknownAuth !== undefined && typeof request.allowUnknownAuth !== 'boolean') throw new Error('allowUnknownAuth must be a boolean');
  const timeoutMs = request.timeoutMs === undefined ? 300000 : request.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 540000) throw new Error('Foreground dispatch timeout must be 1..540000 ms');
  return { ...request, permissions: commandPermissions(request.permissions), timeoutMs };
}

/** The installed destination starts from its own project context and decides containment itself. */
export function destinationDispatchRequest(request) {
  const fields = PUBLIC_FIELDS.filter(key => key !== 'node' && request[key] !== undefined);
  return validateDispatchRequest(Object.fromEntries(fields.map(key => [key, request[key]])));
}
