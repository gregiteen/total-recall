/** Agents wrap their answer in prose and code. Find the last well-formed object that carries the expected key. */
export function lastJsonWith(text, key) {
  const source = String(text || '');
  for (let start = source.lastIndexOf('{'); start >= 0; start = source.lastIndexOf('{', start - 1)) {
    let depth = 0, inString = false;
    for (let i = start; i < source.length; i += 1) {
      const c = source[i];
      if (inString) { if (c === '\\') i += 1; else if (c === '"') inString = false; continue; }
      if (c === '"') inString = true;
      else if (c === '{') depth += 1;
      else if (c === '}') {
        depth -= 1;
        if (depth === 0) {
          try { const value = JSON.parse(source.slice(start, i + 1)); if (value && Object.hasOwn(value, key)) return value; } catch { /* keep looking */ }
          break;
        }
      }
    }
    if (start === 0) break;
  }
  return null;
}
