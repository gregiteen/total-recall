import fs from 'fs';
let content = fs.readFileSync('src/core/vault-watcher.spec.mjs', 'utf8');

// Replace the vi.mock('node:fs') with a custom mock factory
const newMock = `
const mockFs = {
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  watch: vi.fn()
};
vi.mock('node:fs', () => ({ default: mockFs, ...mockFs }));
`;
content = content.replace(/vi\.mock\('node:fs'\);/g, newMock);

// Replace fs.existsSync = ... with fs.existsSync.mockImplementation(...)
content = content.replace(/fs\.existsSync = vi\.fn\(\(\) => false\);/g, "fs.existsSync.mockImplementation(() => false);");
content = content.replace(/fs\.existsSync = vi\.fn\(\(\) => true\);/g, "fs.existsSync.mockImplementation(() => true);");

// Replace fs.mkdirSync = vi.fn(); with fs.mkdirSync.mockClear();
content = content.replace(/fs\.mkdirSync = vi\.fn\(\);/g, "fs.mkdirSync.mockClear();");

// Replace fs.watch = vi.fn(); with fs.watch.mockClear();
content = content.replace(/fs\.watch = vi\.fn\(\);/g, "fs.watch.mockClear();");

// In setupFsWatch, instead of fs.watch.mockImplementation, we keep it because it uses mockImplementation which is fine since we mocked it correctly.

fs.writeFileSync('src/core/vault-watcher.spec.mjs', content);
