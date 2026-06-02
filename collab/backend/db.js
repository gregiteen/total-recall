import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const ANNOTATIONS_FILE = path.join(DATA_DIR, 'annotations.json');

function readJsonFile(filePath, defaultData = []) {
  if (!fs.existsSync(filePath)) return defaultData;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultData;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Users ───────────────────────────────────────────────────────────────────
export function loadUsers() {
  return readJsonFile(USERS_FILE, []);
}

export function saveUsers(users) {
  writeJsonFile(USERS_FILE, users);
}

export function getUser(username) {
  const users = loadUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

export function createUser(username, passwordHash) {
  const users = loadUsers();
  if (getUser(username)) throw new Error('User already exists');
  const user = { username, passwordHash, created_at: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return user;
}

// ─── Groups ──────────────────────────────────────────────────────────────────
export function loadGroups() {
  return readJsonFile(GROUPS_FILE, []);
}

export function saveGroups(groups) {
  writeJsonFile(GROUPS_FILE, groups);
}

export function createGroup(name, owner) {
  const groups = loadGroups();
  const code = crypto.randomBytes(4).toString('hex'); // 8-char random invite code
  const newGroup = {
    id: crypto.randomUUID(),
    name,
    code,
    owner,
    members: [owner],
    created_at: new Date().toISOString()
  };
  groups.push(newGroup);
  saveGroups(groups);
  return newGroup;
}

export function joinGroup(code, username) {
  const groups = loadGroups();
  const group = groups.find(g => g.code.toLowerCase() === code.toLowerCase());
  if (!group) throw new Error('Group not found');
  if (group.members.includes(username)) return group; // already joined
  group.members.push(username);
  saveGroups(groups);
  return group;
}

export function getUserGroups(username) {
  const groups = loadGroups();
  return groups.filter(g => g.members.includes(username));
}

// ─── Annotations ─────────────────────────────────────────────────────────────
export function loadAnnotations() {
  return readJsonFile(ANNOTATIONS_FILE, []);
}

export function saveAnnotations(annotations) {
  writeJsonFile(ANNOTATIONS_FILE, annotations);
}

export function addAnnotation(url, groupCode, author, text, excerpt = '') {
  const annotations = loadAnnotations();
  // Clean URL to match reliably (remove hash and query params optionally, or store raw)
  const cleanUrl = url.split('#')[0];
  
  const newAnnotation = {
    id: crypto.randomUUID(),
    url: cleanUrl,
    groupCode,
    author,
    text,
    excerpt,
    created_at: new Date().toISOString()
  };
  annotations.push(newAnnotation);
  saveAnnotations(annotations);
  return newAnnotation;
}

export function getAnnotations(url, userGroups = []) {
  const annotations = loadAnnotations();
  const cleanUrl = url.split('#')[0];
  const groupCodes = userGroups.map(g => g.code);
  
  return annotations.filter(a => 
    a.url === cleanUrl && groupCodes.includes(a.groupCode)
  );
}
