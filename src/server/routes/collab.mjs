import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { WebSocket } from 'ws';
import { brainDir as configBrainDir } from '../../core/config.mjs';
import { chmodSecure, writeFileSecure } from '../../core/secure-file.mjs';

// Setup database paths in brainDir
const DATA_DIR = path.join(configBrainDir, 'collab');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Signing secret: JWT_SECRET from the environment, otherwise a random secret
// generated once and persisted beside the collab store. There is deliberately no
// hardcoded fallback — a secret that ships in public source lets anyone forge a
// token for any username.
const JWT_SECRET_FILE = path.join(DATA_DIR, '.jwt-secret');
export function resolveJwtSecret(env = process.env, secretFile = JWT_SECRET_FILE) {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) {
      chmodSecure(secretFile);
      return existing;
    }
  } catch { /* not created yet */ }
  const generated = crypto.randomBytes(48).toString('base64url');
  writeFileSecure(secretFile, generated, { encoding: 'utf8' });
  return generated;
}
const JWT_SECRET = resolveJwtSecret();

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
  writeFileSecure(filePath, JSON.stringify(data, null, 2), { encoding: 'utf8' });
}

// ─── Database Helpers ────────────────────────────────────────────────────────
function loadUsers() { return readJsonFile(USERS_FILE, []); }
function saveUsers(users) { writeJsonFile(USERS_FILE, users); }
function getUser(username) {
  return loadUsers().find(u => u.username.toLowerCase() === username.toLowerCase());
}
function createUser(username, passwordHash) {
  const users = loadUsers();
  if (getUser(username)) throw new Error('User already exists');
  const user = { username, passwordHash, created_at: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return user;
}

function loadGroups() { return readJsonFile(GROUPS_FILE, []); }
function saveGroups(groups) { writeJsonFile(GROUPS_FILE, groups); }
function createGroup(name, owner) {
  const groups = loadGroups();
  const code = crypto.randomBytes(4).toString('hex');
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
function joinGroup(code, username) {
  const groups = loadGroups();
  const group = groups.find(g => g.code.toLowerCase() === code.toLowerCase());
  if (!group) throw new Error('Group not found');
  if (group.members.includes(username)) return group;
  group.members.push(username);
  saveGroups(groups);
  return group;
}
function getUserGroups(username) {
  return loadGroups().filter(g => g.members.includes(username));
}

function loadAnnotations() { return readJsonFile(ANNOTATIONS_FILE, []); }
function saveAnnotations(annotations) { writeJsonFile(ANNOTATIONS_FILE, annotations); }
function addAnnotation(url, groupCode, author, text, excerpt = '') {
  const annotations = loadAnnotations();
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
function getAnnotations(url, userGroups = []) {
  const cleanUrl = url.split('#')[0];
  const groupCodes = userGroups.map(g => g.code);
  return loadAnnotations().filter(a => a.url === cleanUrl && groupCodes.includes(a.groupCode));
}

// ─── Middleware ──────────────────────────────────────────────────────────────
function requireCollabAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────
export const collabRouter = express.Router();

collabRouter.post('/api/collab/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = createUser(username, passwordHash);
    const group = createGroup(`${username}'s Workspace`, username);
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username, defaultGroupCode: group.code });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

collabRouter.post('/api/collab/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = getUser(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

collabRouter.get('/api/collab/groups', requireCollabAuth, (req, res) => {
  try {
    const groups = getUserGroups(req.user.username);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

collabRouter.post('/api/collab/groups', requireCollabAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name required' });
  try {
    const group = createGroup(name, req.user.username);
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

collabRouter.post('/api/collab/groups/join', requireCollabAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Invite code required' });
  try {
    const group = joinGroup(code, req.user.username);
    res.json({ success: true, group });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

collabRouter.get('/api/collab/annotations', requireCollabAuth, (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL query parameter required' });
  try {
    const userGroups = getUserGroups(req.user.username);
    const list = getAnnotations(url, userGroups);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

collabRouter.post('/api/collab/annotations', requireCollabAuth, (req, res) => {
  const { url, groupCode, text, excerpt } = req.body;
  if (!url || !groupCode || !text) {
    return res.status(400).json({ error: 'URL, groupCode, and text required' });
  }
  try {
    const userGroups = getUserGroups(req.user.username);
    if (!userGroups.some(g => g.code === groupCode)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    const note = addAnnotation(url, groupCode, req.user.username, text, excerpt);
    broadcastToUrl(url, { type: 'ANNOTATION_ADDED', annotation: note }, { audienceGroups: [groupCode] });
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Live WS Presence / Chat Sync Registry ────────────────────────────────────
const clients = new Map();

export function handleCollabUpgrade(request, socket, head, wss) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    wss.handleUpgrade(request, socket, head, (ws) => {
      clients.set(ws, { username: payload.username, currentUrl: null });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          const clientInfo = clients.get(ws);
          
          if (data.type === 'SUBSCRIBE') {
            const cleanUrl = data.url.split('#')[0];
            clientInfo.currentUrl = cleanUrl;
            broadcastToUrl(cleanUrl, {
              type: 'USER_JOINED',
              username: clientInfo.username,
              url: cleanUrl
            }, { excludeWs: ws, audienceGroups: groupCodesOf(clientInfo.username) });
          }

          if (data.type === 'CHAT_MESSAGE') {
            if (!clientInfo.currentUrl) return;
            broadcastToUrl(clientInfo.currentUrl, {
              type: 'CHAT_MESSAGE',
              username: clientInfo.username,
              text: data.text,
              created_at: new Date().toISOString()
            }, { audienceGroups: groupCodesOf(clientInfo.username) });
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid frame' }));
        }
      });

      ws.on('close', () => {
        const clientInfo = clients.get(ws);
        if (clientInfo && clientInfo.currentUrl) {
          broadcastToUrl(clientInfo.currentUrl, {
            type: 'USER_LEFT',
            username: clientInfo.username
          }, { excludeWs: ws, audienceGroups: groupCodesOf(clientInfo.username) });
        }
        clients.delete(ws);
      });
    });
  } catch (err) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
}

function groupCodesOf(username) {
  return getUserGroups(username).map(g => g.code);
}

/**
 * Send to sockets viewing `url` that share at least one of `audienceGroups`.
 * Presence and chat are group-private: two unrelated groups reading the same
 * page must never see each other's messages. An empty audience reaches no one.
 */
export function broadcastToUrl(url, messageObj, { excludeWs = null, audienceGroups = [] } = {}, registry = clients) {
  const cleanUrl = url.split('#')[0];
  const payload = JSON.stringify(messageObj);
  const audience = new Set(audienceGroups);
  if (audience.size === 0) return;
  const groups = loadGroups();

  for (const [ws, info] of registry.entries()) {
    if (ws === excludeWs || info.currentUrl !== cleanUrl || ws.readyState !== WebSocket.OPEN) continue;
    const shares = groups.some(g => audience.has(g.code) && g.members.includes(info.username));
    if (shares) ws.send(payload);
  }
}
