import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { 
  createUser, 
  getUser, 
  createGroup, 
  joinGroup, 
  getUserGroups, 
  addAnnotation, 
  getAnnotations 
} from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'total-recall-collab-secret-key-1234';
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// ─── Authentication Middleware ───────────────────────────────────────────────
function requireAuth(req, res, next) {
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

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  try {
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = createUser(username, passwordHash);
    
    // Auto-create a default personal group
    const group = createGroup(`${username}'s Workspace`, username);

    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username, defaultGroupCode: group.code });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
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

// ─── Group Routes ────────────────────────────────────────────────────────────
app.get('/api/groups', requireAuth, (req, res) => {
  try {
    const groups = getUserGroups(req.user.username);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name required' });
  try {
    const group = createGroup(name, req.user.username);
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/groups/join', requireAuth, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Invite code required' });
  try {
    const group = joinGroup(code, req.user.username);
    res.json({ success: true, group });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Annotation Routes ───────────────────────────────────────────────────────
app.get('/api/annotations', requireAuth, (req, res) => {
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

app.post('/api/annotations', requireAuth, (req, res) => {
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
    
    // Broadcast creation through WebSockets (live annotations)
    broadcastToUrl(url, {
      type: 'ANNOTATION_ADDED',
      annotation: note
    });

    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Real-Time WebSocket Channel Sync ─────────────────────────────────────────

// Map of active connections: ws -> { username, currentUrl }
const clients = new Map();

server.on('upgrade', (request, socket, head) => {
  // Extract token from query params or headers
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
      wss.emit('connection', ws, request);
    });
  } catch (err) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const clientInfo = clients.get(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle subscribing to page context channel
      if (data.type === 'SUBSCRIBE') {
        const cleanUrl = data.url.split('#')[0];
        clientInfo.currentUrl = cleanUrl;
        
        // Notify other users on the page
        broadcastToUrl(cleanUrl, {
          type: 'USER_JOINED',
          username: clientInfo.username,
          url: cleanUrl
        }, ws);
      }

      // Handle sending live chat messages on a page
      if (data.type === 'CHAT_MESSAGE') {
        if (!clientInfo.currentUrl) return;
        
        broadcastToUrl(clientInfo.currentUrl, {
          type: 'CHAT_MESSAGE',
          username: clientInfo.username,
          text: data.text,
          created_at: new Date().toISOString()
        });
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid frame' }));
    }
  });

  ws.on('close', () => {
    if (clientInfo && clientInfo.currentUrl) {
      broadcastToUrl(clientInfo.currentUrl, {
        type: 'USER_LEFT',
        username: clientInfo.username
      });
    }
    clients.delete(ws);
  });
});

function broadcastToUrl(url, messageObj, excludeWs = null) {
  const cleanUrl = url.split('#')[0];
  const payload = JSON.stringify(messageObj);

  for (const [ws, info] of clients.entries()) {
    if (ws !== excludeWs && info.currentUrl === cleanUrl && ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ─── Start HTTP Server ────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🚀 Collaboration backend running on http://localhost:${PORT}`);
});
