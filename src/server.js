'use strict';

require('dotenv').config();

const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path         = require('path');
const crypto       = require('crypto');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const compression  = require('compression');
const mongoose     = require('mongoose');
const fs           = require('fs');

// ─── Gender Matchmaking Module ────────────────────────────────────────────────
const createGenderMatcher = require('./gender');

// ─── App Bootstrap ────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());

// ─── Constants ────────────────────────────────────────────────────────────────
const PORT                       = process.env.PORT                       || 3000;
const MONGO_URI                  = process.env.MONGO_URI                  || 'mongodb+srv://naya:naya@naya.fk9em5f.mongodb.net/?appName=naya';
const OREY_ID_TTL_MS             = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS       = 5000;
const API_KEY                    = process.env.API_KEY                    || 'oryx_2024_secure_key_change_this';
const ADMIN_KEY                  = process.env.ADMIN_KEY                  || 'admin_secret_change_this';
const AUTO_BAN_THRESHOLD         = 3;
const HIGH_PRIORITY_BAN_THRESHOLD = 2;
const DEFAULT_BAN_DURATION_HOURS = 720;
const SESSION_DURATION_MS        = 2 * 60 * 60 * 1000; // 2 hours
const SERVICE_NAME               = 'Orey! - Mana App';

const VIDEO_QUALITY = {
  low:    { maxBitrate: 150000,   scaleResolutionDownBy: 4, maxFramerate: 15 },
  medium: { maxBitrate: 500000,   scaleResolutionDownBy: 2, maxFramerate: 24 },
  high:   { maxBitrate: 1500000,  scaleResolutionDownBy: 1, maxFramerate: 30 },
  hd:     { maxBitrate: 4000000,  scaleResolutionDownBy: 1, maxFramerate: 30 },
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302'  },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

const HIGH_PRIORITY_REASONS = [
  'Nudity / Sexual Content', 'Sexual Harassment', 'Underage User',
  'Violence / Threats', 'Non-Consensual Content', 'Child Safety Concern',
];
const REGULAR_REASONS = [
  'Inappropriate Behavior', 'Spam / Bot', 'Fake Profile',
  'Harassment', 'Hate Speech', 'Other',
];

// ─── MongoDB Schemas ──────────────────────────────────────────────────────────

// Banned devices
const BanSchema = new mongoose.Schema({
  deviceId:     { type: String, required: true, unique: true, index: true },
  reason:       String,
  timestamp:    { type: Date,   default: Date.now },
  expiresAt:    { type: Date,   default: null },
  durationHours:{ type: Number, default: null },
  permanent:    { type: Boolean,default: false },
  source:       { type: String, default: 'manual' },
  isHighPriority:{ type: Boolean, default: false },
  reportIds:    [String],
});
BanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $ne: null } } });
const Ban = mongoose.model('Ban', BanSchema);

// Reports
const ReportSchema = new mongoose.Schema({
  id:               { type: String, required: true, unique: true, index: true },
  reporterDeviceId: String,
  reportedDeviceId: { type: String, index: true },
  reportedUserId:   String,
  reason:           String,
  description:      String,
  evidence:         String,
  timestamp:        { type: Date, default: Date.now },
  status:           { type: String, default: 'pending', index: true },
  reviewedBy:       String,
  reviewNotes:      String,
  reviewedAt:       Date,
  autoBanned:       { type: Boolean, default: false },
  isHighPriority:   { type: Boolean, default: false },
});
const Report = mongoose.model('Report', ReportSchema);

// Notifications
const NotificationSchema = new mongoose.Schema({
  id:             { type: Number, required: true, unique: true, index: true },
  title:          String,
  message:        String,
  type:           { type: String, default: 'info' },
  priority:       { type: String, default: 'normal' },
  targetPlatform: { type: String, default: 'all' },
  targetDeviceIds:{ type: [String], default: [] },
  timestamp:      { type: Date, default: Date.now },
  actionUrl:      { type: String, default: '/' },
  icon:           { type: String, default: '📢' },
  imageUrl:       String,
  isRead:         { type: Boolean, default: false },
  readAt:         Date,
  readBy:         String,
  expiresIn:      { type: Number, default: 30 },
});
const Notification = mongoose.model('Notification', NotificationSchema);

// App config (single persisted document)
const AppConfigSchema = new mongoose.Schema({
  _id:          { type: String, default: 'main' },
  android:      Object,
  maintenance:  Object,
  videoQuality: Object,
  safety:       Object,
});
const AppConfigModel = mongoose.model('AppConfig', AppConfigSchema);

// Report counters (per device)
const ReportCountSchema = new mongoose.Schema({
  deviceId:         { type: String, required: true, unique: true, index: true },
  total:            { type: Number, default: 0 },
  highPriority:     { type: Number, default: 0 },
  reportedBy:       { type: [String], default: [] },
});
const ReportCount = mongoose.model('ReportCount', ReportCountSchema);

// ─── In-Memory Runtime State ──────────────────────────────────────────────────
const oreyIds              = new Map();
const rooms                = new Map();
const randomQueue          = [];
const autoSearchTimers     = new Map();
const notificationSubscriptions = new Map();
const ADMIN_SESSIONS       = new Map();

let bannedDevicesCache     = new Map();
let appConfig              = null;
let notificationsCache     = [];
let notificationIdCounter  = 1;

// ─── DB Init & Cache Warmup ───────────────────────────────────────────────────
async function initDB() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('✅ MongoDB connected');

  // Load / create app config
  let cfg = await AppConfigModel.findById('main').lean();
  if (!cfg) {
    cfg = {
      _id: 'main',
      android: {
        versionCode: 1, versionName: '1.0.0', updateType: 'flexible', updatePriority: 2,
        updateMessage: 'New features available! Update for better experience.',
        updateTitle: 'Update Available',
        whatsNew: ['HD Video quality support','Push notifications','Improved connection stability','Enhanced safety features'],
        forceUpdateMinVersion: 1,
        downloadUrl: 'https://play.google.com/store/apps/details?id=com.orey.app',
        changelog: 'https://orey.app/changelog',
      },
      maintenance:  { enabled: false, message: "We're improving Orey. Back soon!" },
      videoQuality: { default: 'medium', autoAdjust: true, maxBitrate: 1500000 },
      safety: {
        autoBanEnabled: true, autoBanThreshold: AUTO_BAN_THRESHOLD,
        highPriorityThreshold: HIGH_PRIORITY_BAN_THRESHOLD,
        reportingEnabled: true, contentModeration: true,
      },
    };
    await AppConfigModel.create(cfg);
  }
  appConfig = cfg;

  // Load bans into cache
  const bans = await Ban.find({}).lean();
  for (const b of bans) bannedDevicesCache.set(b.deviceId, b);
  console.log(`📦 Loaded ${bans.length} bans from DB`);

  // Load notifications
  const notifs = await Notification.find({}).sort({ id: 1 }).lean();
  if (notifs.length === 0) {
    const welcome = {
      id: 1,
      title: '🎉 Welcome to Orey!',
      message: 'Start video calling with friends using Orey-ID. Share your Orey-XXXXX code to connect!',
      type: 'info',
      priority: 'normal',
      targetPlatform: 'all',
      targetDeviceIds: [],
      timestamp: new Date(),
      actionUrl: '/welcome',
      icon: '🎉',
      imageUrl: 'https://i.postimg.cc/cLq03ZZg/IMG-20260428-WA0002.jpg',
      isRead: false,
      readAt: null,
      readBy: null,
      expiresIn: 30,
    };
    await Notification.create(welcome);
    notificationsCache = [welcome];
    notificationIdCounter = 2;
  } else {
    notificationsCache = notifs.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type || 'info',
      priority: n.priority || 'normal',
      targetPlatform: n.targetPlatform || 'all',
      targetDeviceIds: n.targetDeviceIds || [],
      timestamp: n.timestamp,
      actionUrl: n.actionUrl || '/',
      icon: n.icon || '📢',
      imageUrl: n.imageUrl || null,
      isRead: n.isRead || false,
      readAt: n.readAt || null,
      readBy: n.readBy || null,
      expiresIn: n.expiresIn || 30,
    }));
    notificationIdCounter = Math.max(...notifs.map(n => n.id), 0) + 1;
  }
  console.log(`📦 Loaded ${notificationsCache.length} notifications`);
}

// ─── Security: Browser Request Detection Middleware ────────────────────────────
function isBrowserRequest(req) {
  const accept = req.headers.accept || '';
  const userAgent = req.headers['user-agent'] || '';
  // Check if request is from a browser (accepts HTML) and not API client
  return accept.includes('text/html') && !userAgent.includes('OreyApp') && !req.headers['x-api-key'];
}

// Middleware to hide API responses from browsers
app.use('/api/', (req, res, next) => {
  if (isBrowserRequest(req)) {
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SERVICE_NAME}</title>
  <style>
    body { font-family: system-ui; background: #0b0f17; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; background: #1e293b; padding: 3rem; border-radius: 24px; border: 1px solid #334155; max-width: 500px; }
    h1 { color: #3b82f6; font-size: 2.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; }
    .status { display: inline-block; background: #065f46; color: #6ee7b7; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔷</div>
    <h1>${SERVICE_NAME}</h1>
    <p class="subtitle">Video Calling Platform</p>
    <span class="status">🟢 Service Running</span>
  </div>
</body>
</html>`);
  }
  next();
});

// Also hide admin endpoints from browsers without proper headers
app.use('/admin/', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next(); // Allow login/logout
  if (isBrowserRequest(req) && !req.headers['x-session-token']) {
    return res.redirect('/admin');
  }
  next();
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: { error: 'Too many requests, please try again later.' } 
});
app.use('/api/',   apiLimiter);
app.use('/admin/', apiLimiter);

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors:              { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7,
  pingTimeout:       60000,
  pingInterval:      25000,
});

// ─── Gender Matcher Instance ──────────────────────────────────────────────────
const genderMatcher = createGenderMatcher(io);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateOreyId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return 'OREY-' + suffix;
}

function generateRoomId() {
  return uuidv4().replace(/-/g, '').substring(0, 8).toLowerCase();
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanExpiredOreyIds() {
  const now = Date.now();
  for (const [id, data] of oreyIds.entries()) {
    if (data.expiresAt < now) oreyIds.delete(id);
  }
}

function removeFromQueue(socketId) {
  const idx = randomQueue.indexOf(socketId);
  if (idx !== -1) randomQueue.splice(idx, 1);
}

function removeSocketFromRooms(socketId) {
  for (const [roomId, peers] of rooms.entries()) {
    if (peers.has(socketId)) {
      peers.delete(socketId);
      if (peers.size === 0) rooms.delete(roomId);
      return { roomId, peers };
    }
  }
  return null;
}

function scheduleAutoSearch(socket, delay = AUTO_SEARCH_DELAY_MS) {
  cancelAutoSearch(socket.id);
  const timer = setTimeout(() => {
    autoSearchTimers.delete(socket.id);
    randomQueue.push(socket.id);
    attemptMatch(socket.id);
  }, delay);
  autoSearchTimers.set(socket.id, timer);
  socket.emit('auto-search-scheduled', { delay });
}

function cancelAutoSearch(socketId) {
  const timer = autoSearchTimers.get(socketId);
  if (timer) { clearTimeout(timer); autoSearchTimers.delete(socketId); }
}

function attemptMatch(newSocketId) {
  const socket = io.sockets.sockets.get(newSocketId);
  if (!socket) return;

  const gender  = socket.data.gender || null;
  let selfId    = newSocketId;
  let partnerId = null;

  // Priority 1 — gender-aware match (opposite first, then same)
  if (gender) {
    const match = genderMatcher.findMatch(newSocketId, gender);
    if (match) {
      partnerId = match.socketId;
      genderMatcher.dequeue(selfId);       // matched — remove self from gender queue
      removeFromQueue(partnerId);          // remove partner from plain queue if present
      removeFromQueue(selfId);
    }
  }

  // Priority 2 — plain random queue fallback
  if (!partnerId) {
    if (randomQueue.length < 2) return;

    const idxSelf = randomQueue.indexOf(selfId);
    if (idxSelf === -1) return;

    let partnerIdx = -1;
    for (let i = 0; i < randomQueue.length; i++) {
      if (i !== idxSelf) { partnerIdx = i; break; }
    }
    if (partnerIdx === -1) return;

    // Capture IDs before mutating the array
    partnerId = randomQueue[partnerIdx];
    const highIdx = Math.max(idxSelf, partnerIdx);
    const lowIdx  = Math.min(idxSelf, partnerIdx);
    randomQueue.splice(highIdx, 1);
    randomQueue.splice(lowIdx,  1);
  }

  // Wire up the room
  const selfSocket    = io.sockets.sockets.get(selfId);
  const partnerSocket = io.sockets.sockets.get(partnerId);

  if (!selfSocket || !partnerSocket) {
    if (selfSocket)    { randomQueue.push(selfId);    attemptMatch(selfId); }
    if (partnerSocket) { randomQueue.push(partnerId); attemptMatch(partnerId); }
    return;
  }

  const roomId = generateRoomId();
  rooms.set(roomId, new Map());
  selfSocket.join(roomId);
  partnerSocket.join(roomId);

  const selfData = {
    userName: selfSocket.data.userName    || 'Anonymous',
    oreyId:   selfSocket.data.oreyId      || null,
    deviceId: selfSocket.data.deviceId    || null,
    gender:   selfSocket.data.gender      || null,
  };
  const partnerData = {
    userName: partnerSocket.data.userName || 'Anonymous',
    oreyId:   partnerSocket.data.oreyId   || null,
    deviceId: partnerSocket.data.deviceId || null,
    gender:   partnerSocket.data.gender   || null,
  };

  rooms.get(roomId).set(selfId,    selfData);
  rooms.get(roomId).set(partnerId, partnerData);

  const roomData = { roomId, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS, autoMatched: true };

  selfSocket.emit('room-joined',    { ...roomData, peers: [{ socketId: partnerId, ...partnerData }] });
  partnerSocket.emit('room-joined', { ...roomData, peers: [{ socketId: selfId,    ...selfData    }] });
  selfSocket.emit('incoming-call',    { fromName: partnerData.userName, fromOreyId: partnerData.oreyId, partnerGender: partnerData.gender, autoMatched: true });
  partnerSocket.emit('incoming-call', { fromName: selfData.userName,    fromOreyId: selfData.oreyId,    partnerGender: selfData.gender,    autoMatched: true });
}

// ─── Ban helpers ──────────────────────────────────────────────────────────────
function isDeviceBanned(deviceId) {
  if (!deviceId) return null;
  const ban = bannedDevicesCache.get(deviceId);
  if (!ban) return null;
  if (ban.expiresAt && Date.now() > new Date(ban.expiresAt).getTime()) {
    bannedDevicesCache.delete(deviceId);
    Ban.deleteOne({ deviceId }).catch(() => {});
    return null;
  }
  return ban;
}

async function banDeviceAndDisconnect(deviceId, banInfo) {
  bannedDevicesCache.set(deviceId, banInfo);
  await Ban.findOneAndUpdate({ deviceId }, { $set: banInfo }, { upsert: true }).catch(() => {});

  const socketsToDisconnect = [];
  for (const [, socket] of io.sockets.sockets) {
    if (socket.data.deviceId === deviceId) socketsToDisconnect.push(socket);
  }
  for (const socket of socketsToDisconnect) {
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);
    genderMatcher.dequeue(socket.id);
    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const ps = io.sockets.sockets.get(pid);
        if (ps) { ps.emit('partner-left', { socketId: socket.id, reason: 'banned' }); scheduleAutoSearch(ps); }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
    socket.emit('device-banned', banInfo);
    socket.disconnect(true);
  }

  console.log(`🚫 Banned device: ${deviceId.substring(0, 12)}... - ${socketsToDisconnect.length} sockets disconnected`);
  return socketsToDisconnect.length;
}

function validateOreyId(id) {
  const cleanId = id.toUpperCase().trim();
  if (cleanId.startsWith('OREY-')) return cleanId.length === 10 ? cleanId : null;
  if (cleanId.length === 5) return 'OREY-' + cleanId;
  return null;
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const verifyApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key)       return res.status(401).json({ error: 'API key required' });
  if (key !== API_KEY) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

const verifySession = (req, res, next) => {
  const token = req.headers['x-session-token'] || req.query.session_token || req.body.sessionToken;
  
  if (!token) {
    return res.status(401).json({ error: 'Session token required. Please login first.' });
  }
  
  const session = ADMIN_SESSIONS.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session. Please login again.' });
  }
  
  if (session.expiresAt < Date.now()) {
    ADMIN_SESSIONS.delete(token);
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
  
  next();
};

// ─── Helper Functions ─────────────────────────────────────────────────────────
function isNotifExpired(n) {
  if (!n.expiresIn || n.expiresIn <= 0) return false;
  const expiry = new Date(n.timestamp);
  expiry.setDate(expiry.getDate() + n.expiresIn);
  return new Date() > expiry;
}

async function saveNotification(notif) {
  notificationsCache.push(notif);
  await Notification.create(notif).catch(() => {});
}

async function persistAppConfig() {
  await AppConfigModel.findByIdAndUpdate('main', { $set: appConfig }, { upsert: true }).catch(() => {});
}

// ─── Determine Public Path ────────────────────────────────────────────────────
const publicPath = (() => {
  const paths = [
    path.join(__dirname, 'public'),        // server.js in root, public in root
    path.join(__dirname, '..', 'public'),  // server.js in src, public in root
    path.join(__dirname, 'src', 'public'), // server.js in root, public in src
  ];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      console.log(`📂 Found public directory: ${p}`);
      return p;
    }
  }
  
  // Create default public directory
  const defaultPath = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(defaultPath)) {
    fs.mkdirSync(defaultPath, { recursive: true });
    console.log(`📁 Created public directory: ${defaultPath}`);
  }
  return defaultPath;
})();

// ─── Public Endpoints ─────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    uptime: process.uptime(),
    activeConnections: io.engine.clientsCount,
    bannedDevices: bannedDevicesCache.size,
    activeAdminSessions: ADMIN_SESSIONS.size,
    notificationSubscriptions: notificationSubscriptions.size,
    memory: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.get('/generate-orey-id', (_req, res) => {
  cleanExpiredOreyIds();
  let oreyId;
  let attempts = 0;
  do { oreyId = generateOreyId(); attempts++; } while (oreyIds.has(oreyId) && attempts < 20);
  const expiresAt = Date.now() + OREY_ID_TTL_MS;
  oreyIds.set(oreyId, { expiresAt, socketId: null, userName: '' });
  res.json({ oreyId, expiresAt, format: 'OREY-XXXXX (5 characters)', validDuration: '24 hours' });
});

app.get('/create-room', (_req, res) => res.json({ roomId: generateRoomId() }));

app.get('/api/get-key-hash', (_req, res) => {
  res.json({ hash: crypto.createHash('sha256').update(API_KEY).digest('hex').substring(0, 32) });
});

// ─── App API Endpoints ────────────────────────────────────────────────────────
app.get('/api/version', (req, res) => {
  const platform = req.query.platform || 'android';
  const clientVersion = parseInt(req.query.version) || 0;
  const platformConfig = appConfig[platform];
  if (!platformConfig) return res.status(400).json({ error: 'Invalid platform' });
  res.json(clientVersion < platformConfig.versionCode
    ? { updateAvailable: true, ...platformConfig }
    : { updateAvailable: false, currentVersion: platformConfig.versionName });
});

app.get('/api/notifications', (req, res) => {
  const lastId    = parseInt(req.query.after_id) || 0;
  const deviceId  = req.query.device_id;
  const platform  = req.query.platform || 'all';

  if (deviceId) {
    notificationSubscriptions.set(deviceId, { 
      lastCheck: new Date().toISOString(), 
      platform 
    });
  }

  let filtered = notificationsCache.filter(n => {
    if (n.expiresIn && n.expiresIn > 0) {
      const expiryDate = new Date(n.timestamp);
      expiryDate.setDate(expiryDate.getDate() + n.expiresIn);
      if (new Date() > expiryDate) return false;
    }
    return n.id > lastId;
  });
  
  if (platform !== 'all') {
    filtered = filtered.filter(n => 
      !n.targetPlatform || 
      n.targetPlatform === platform || 
      n.targetPlatform === 'all'
    );
  }

  res.json({
    success: true, 
    notifications: filtered, 
    total: filtered.length,
    unread: filtered.filter(n => !n.isRead).length,
    serverTime: new Date().toISOString(),
    lastId: filtered.length > 0 ? Math.max(...filtered.map(n => n.id)) : lastId,
  });
});

app.get('/api/config', (req, res) => {
  const clientVersion = parseInt(req.query.version) || 0;
  res.json({
    features: { 
      videoCall: true, 
      hdVideo: clientVersion >= 2, 
      groupCall: false, 
      screenShare: clientVersion >= 3, 
      reporting: true, 
      safetyFeatures: true,
      chat: true
    },
    videoQuality: appConfig.videoQuality, 
    iceServers: ICE_SERVERS, 
    safety: appConfig.safety,
    reportReasons: { highPriority: HIGH_PRIORITY_REASONS, regular: REGULAR_REASONS },
    urls: {
      mainApp:    process.env.MAIN_APP_URL || 'https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/',
      help:       'https://orey.app/help',
      safety:     'https://orey.app/safety',
      guidelines: 'https://orey.app/community-guidelines',
    },
    maintenance: appConfig.maintenance,
  });
});

// ─── Device & Report Endpoints ────────────────────────────────────────────────
app.post('/api/device/register', verifyApiKey, (req, res) => {
  const { deviceId, platform } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const banInfo = isDeviceBanned(deviceId);
  if (banInfo) return res.status(403).json({ 
    error: 'Device is banned', 
    banned: true, 
    reason: banInfo.reason, 
    timestamp: banInfo.timestamp, 
    expiresAt: banInfo.expiresAt || null, 
    durationHours: banInfo.durationHours || null, 
    permanent: !banInfo.expiresAt 
  });
  console.log(`📱 Device registered: ${deviceId.substring(0, 12)}... (${platform || 'unknown'})`);
  res.json({ success: true, deviceId, registered: true, timestamp: new Date().toISOString() });
});

app.post('/api/device/check-ban', verifyApiKey, (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const banInfo = isDeviceBanned(deviceId);
  if (banInfo) return res.status(403).json({ banned: true, ...banInfo });
  res.json({ banned: false });
});

app.post('/api/report', verifyApiKey, async (req, res) => {
  const { reporterDeviceId, reportedDeviceId, reportedUserId, reason, description, evidence } = req.body;
  if (!reportedDeviceId || !reason)  return res.status(400).json({ error: 'reportedDeviceId and reason are required' });
  if (!reporterDeviceId)             return res.status(400).json({ error: 'reporterDeviceId is required' });
  if (reporterDeviceId === reportedDeviceId) return res.status(400).json({ error: 'Cannot report yourself' });

  const reportedDoc = await ReportCount.findOne({ deviceId: reportedDeviceId }).lean();
  if (reportedDoc && reportedDoc.reportedBy && reportedDoc.reportedBy.includes(reporterDeviceId)) {
    return res.status(400).json({ error: 'Already reported this user', alreadyReported: true });
  }

  const reportId      = generateRoomId();
  const isHighPriority = HIGH_PRIORITY_REASONS.includes(reason);
  const report = {
    id: reportId, reporterDeviceId, reportedDeviceId, reportedUserId: reportedUserId || null,
    reason, description: description || '', evidence: evidence || null,
    timestamp: new Date().toISOString(), status: 'pending', reviewedBy: null,
    reviewNotes: '', reviewedAt: null, autoBanned: false, isHighPriority,
  };

  await Report.create(report);

  const counter = await ReportCount.findOneAndUpdate(
    { deviceId: reportedDeviceId },
    { $inc: { total: 1, ...(isHighPriority ? { highPriority: 1 } : {}) }, $addToSet: { reportedBy: reporterDeviceId } },
    { upsert: true, new: true }
  );

  const currentCount      = counter.total;
  const highPriorityCount = counter.highPriority;

  console.log(`🚨 Report #${reportId}: ${reportedDeviceId.substring(0, 12)}... for "${reason}" (HP:${isHighPriority})`);

  let autoBanned = false, banInfo = null;
  const shouldAutoBan = (isHighPriority && highPriorityCount >= HIGH_PRIORITY_BAN_THRESHOLD) ||
                        (!isHighPriority && currentCount >= AUTO_BAN_THRESHOLD);

  if (shouldAutoBan && appConfig.safety.autoBanEnabled) {
    const banDuration = isHighPriority ? 0 : DEFAULT_BAN_DURATION_HOURS;
    banInfo = {
      deviceId: reportedDeviceId,
      reason: isHighPriority
        ? `Auto-banned (HIGH PRIORITY): ${highPriorityCount} reports for "${reason}"`
        : `Auto-banned: ${currentCount} reports | Latest: ${reason}`,
      timestamp: new Date().toISOString(),
      expiresAt: banDuration > 0 ? new Date(Date.now() + banDuration * 3600000) : null,
      durationHours: banDuration > 0 ? banDuration : null,
      permanent: banDuration === 0, source: 'auto', isHighPriority, reportIds: [],
    };
    await Report.updateMany({ reportedDeviceId }, { $set: { status: 'auto_banned', autoBanned: true } });
    await banDeviceAndDisconnect(reportedDeviceId, banInfo);
    autoBanned = true;
    console.log(`🤖 AUTO-BANNED: ${reportedDeviceId.substring(0, 12)}... - ${banInfo.permanent ? 'PERMANENT' : `${banInfo.durationHours} hours`}`);
  }

  res.json({ 
    success: true, 
    reportId, 
    reportCount: currentCount, 
    highPriorityCount, 
    isHighPriority, 
    autoBanned, 
    banInfo: banInfo || null, 
    thresholds: { regular: AUTO_BAN_THRESHOLD, highPriority: HIGH_PRIORITY_BAN_THRESHOLD } 
  });
});

// ─── Notification Read Endpoints ──────────────────────────────────────────────
app.put('/api/notifications/:id/read', verifyApiKey, async (req, res) => {
  const id = parseInt(req.params.id);
  const notif = notificationsCache.find(n => n.id === id);
  if (!notif) return res.status(404).json({ error: 'Notification not found' });
  const deviceId = req.body.deviceId || 'unknown';
  notif.isRead = true; 
  notif.readAt = new Date().toISOString(); 
  notif.readBy = deviceId;
  await Notification.findOneAndUpdate({ id }, { $set: { isRead: true, readAt: notif.readAt, readBy: deviceId } }).catch(() => {});
  res.json({ success: true, notification: notif });
});

app.put('/api/notifications/read-all', verifyApiKey, async (req, res) => {
  const deviceId = req.body.deviceId || 'unknown';
  let marked = 0;
  for (const n of notificationsCache) {
    if (!n.isRead) { 
      n.isRead = true; 
      n.readAt = new Date().toISOString(); 
      n.readBy = deviceId; 
      marked++; 
    }
  }
  await Notification.updateMany({ isRead: false }, { $set: { isRead: true, readAt: new Date().toISOString(), readBy: deviceId } }).catch(() => {});
  res.json({ success: true, markedAsRead: marked });
});

// ─── Admin Authentication Endpoints ───────────────────────────────────────────
app.post('/admin/login', (req, res) => {
  const { adminKey } = req.body;
  
  if (!adminKey) {
    return res.status(400).json({ error: 'Admin key required' });
  }
  
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  
  const sessionToken = generateSessionToken();
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  
  ADMIN_SESSIONS.set(sessionToken, {
    expiresAt,
    createdAt: Date.now(),
  });
  
  console.log(`🔐 Admin login successful. Session created: ${sessionToken.substring(0, 16)}...`);
  
  res.json({
    success: true,
    sessionToken,
    expiresAt: new Date(expiresAt).toISOString(),
    durationHours: SESSION_DURATION_MS / (60 * 60 * 1000),
  });
});

app.post('/admin/logout', (req, res) => {
  const token = req.headers['x-session-token'] || req.body.sessionToken;
  if (token) {
    ADMIN_SESSIONS.delete(token);
    console.log(`🔐 Admin logged out. Session removed: ${token.substring(0, 16)}...`);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ─── Admin Gender Stats Endpoint ──────────────────────────────────────────────
app.get('/admin/gender-stats', verifySession, (_req, res) => {
  res.json({
    ...genderMatcher.stats(),
    randomQueueLength: randomQueue.length,
  });
});

// ─── App Version (Admin) ─────────────────────────────────────────────────────
app.put('/api/version', verifySession, async (req, res) => {
  const { platform, versionCode, versionName, updateType, updateMessage, downloadUrl, whatsNew } = req.body;
  if (!platform || !versionCode) return res.status(400).json({ error: 'Platform and versionCode required' });
  if (!appConfig[platform]) appConfig[platform] = {};
  Object.assign(appConfig[platform], { 
    versionCode, 
    versionName: versionName || `v${versionCode}`, 
    updateType: updateType || 'flexible', 
    updateMessage: updateMessage || 'New update available!', 
    downloadUrl: downloadUrl || appConfig[platform].downloadUrl 
  });
  if (whatsNew) appConfig[platform].whatsNew = whatsNew;
  await persistAppConfig();
  io.emit('update-available', appConfig[platform]);
  res.json({ success: true, config: appConfig[platform] });
});

// ─── Admin Notification Endpoints ─────────────────────────────────────────────
app.get('/admin/notifications', verifySession, (req, res) => {
  const active = notificationsCache.filter(n => !isNotifExpired(n));
  res.json({ notifications: notificationsCache, total: notificationsCache.length, active: active.length });
});

app.post('/admin/notifications', verifySession, async (req, res) => {
  const { title, message, type, priority, actionUrl, icon, imageUrl, expiresIn, targetPlatform } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });
  
  const newNotification = {
    id: notificationIdCounter++, 
    title, 
    message, 
    type: type || 'info', 
    priority: priority || 'normal',
    targetPlatform: targetPlatform || 'all',
    targetDeviceIds: [],
    timestamp: new Date().toISOString(),
    actionUrl: actionUrl || '/', 
    icon: icon || '📢', 
    imageUrl: imageUrl || null,
    isRead: false,
    readAt: null,
    readBy: null,
    expiresIn: expiresIn || 30,
  };
  
  await saveNotification(newNotification);
  io.emit('new-notification', newNotification);
  
  console.log(`📢 Notification sent: "${title}" to ${io.engine.clientsCount} clients`);
  res.json({ success: true, notification: newNotification, activeClients: io.engine.clientsCount });
});

app.post('/admin/notifications/targeted', verifySession, async (req, res) => {
  const { title, message, type, priority, targetPlatform, targetDeviceIds, actionUrl, icon, imageUrl, expiresIn } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });
  
  const newNotification = {
    id: notificationIdCounter++, 
    title, 
    message, 
    type: type || 'info', 
    priority: priority || 'normal',
    targetPlatform: targetPlatform || 'all', 
    targetDeviceIds: targetDeviceIds || [],
    timestamp: new Date().toISOString(), 
    actionUrl: actionUrl || '/', 
    icon: icon || '📢',
    imageUrl: imageUrl || null, 
    isRead: false,
    readAt: null,
    readBy: null,
    expiresIn: expiresIn || 30,
  };
  
  await saveNotification(newNotification);
  
  if (targetDeviceIds && targetDeviceIds.length > 0) {
    for (const [, socket] of io.sockets.sockets) {
      if (targetDeviceIds.includes(socket.data.deviceId)) {
        socket.emit('new-notification', newNotification);
      }
    }
    console.log(`📢 Targeted notification sent to ${targetDeviceIds.length} devices: "${title}"`);
  } else {
    io.emit('new-notification', newNotification);
    console.log(`📢 Notification broadcast to all ${io.engine.clientsCount} clients: "${title}"`);
  }
  
  res.json({ success: true, notification: newNotification, activeClients: io.engine.clientsCount });
});

app.get('/admin/notifications/stats', verifySession, (req, res) => {
  const stats = { 
    total: notificationsCache.length, 
    active: 0, 
    unread: 0, 
    byType: {}, 
    byPriority: {}, 
    subscriptions: notificationSubscriptions.size 
  };
  
  for (const n of notificationsCache) {
    if (!isNotifExpired(n)) stats.active++;
    if (!n.isRead) stats.unread++;
    stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
    stats.byPriority[n.priority] = (stats.byPriority[n.priority] || 0) + 1;
  }
  
  res.json(stats);
});

app.delete('/admin/notifications/:id', verifySession, async (req, res) => {
  const id = parseInt(req.params.id);
  const idx = notificationsCache.findIndex(n => n.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Notification not found' });
  const deleted = notificationsCache.splice(idx, 1)[0];
  await Notification.deleteOne({ id }).catch(() => {});
  console.log(`🗑️ Notification deleted: #${id}`);
  res.json({ success: true, deleted });
});

// ─── Admin Config Endpoints ───────────────────────────────────────────────────
app.post('/admin/maintenance', verifySession, async (req, res) => {
  const { enabled, message } = req.body;
  appConfig.maintenance = { enabled: enabled || false, message: message || '' };
  await persistAppConfig();
  io.emit('maintenance-mode', appConfig.maintenance);
  console.log(`🔧 Maintenance ${enabled ? 'ENABLED' : 'DISABLED'}`);
  res.json({ success: true, maintenance: appConfig.maintenance });
});

app.put('/admin/video-quality', verifySession, async (req, res) => {
  const { default: def, autoAdjust, maxBitrate } = req.body;
  if (def && VIDEO_QUALITY[def]) appConfig.videoQuality.default = def;
  if (autoAdjust !== undefined) appConfig.videoQuality.autoAdjust = autoAdjust;
  if (maxBitrate) appConfig.videoQuality.maxBitrate = maxBitrate;
  await persistAppConfig();
  io.emit('video-quality-update', appConfig.videoQuality);
  res.json({ success: true, videoQuality: appConfig.videoQuality });
});

app.put('/admin/safety-settings', verifySession, async (req, res) => {
  const { autoBanEnabled, autoBanThreshold, highPriorityThreshold, reportingEnabled, contentModeration } = req.body;
  if (autoBanEnabled !== undefined)         appConfig.safety.autoBanEnabled         = autoBanEnabled;
  if (autoBanThreshold)                     appConfig.safety.autoBanThreshold        = autoBanThreshold;
  if (highPriorityThreshold)                appConfig.safety.highPriorityThreshold   = highPriorityThreshold;
  if (reportingEnabled !== undefined)       appConfig.safety.reportingEnabled        = reportingEnabled;
  if (contentModeration !== undefined)      appConfig.safety.contentModeration       = contentModeration;
  await persistAppConfig();
  io.emit('safety-settings-update', appConfig.safety);
  res.json({ success: true, safety: appConfig.safety });
});

// ─── Admin Report Endpoints ───────────────────────────────────────────────────
app.get('/admin/reports', verifySession, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const allReports = await Report.find(filter).sort({ timestamp: -1 }).lean();
  res.json({
    reports: allReports, 
    total: allReports.length,
    pending:    await Report.countDocuments({ status: 'pending' }),
    autoBanned: await Report.countDocuments({ status: 'auto_banned' }),
    highPriority: await Report.countDocuments({ isHighPriority: true }),
    activeBans: bannedDevicesCache.size,
  });
});

app.post('/admin/reports/:reportId/action', verifySession, async (req, res) => {
  const { reportId } = req.params;
  const { action, banDuration, notes } = req.body;
  const report = await Report.findOne({ id: reportId });
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status !== 'pending') return res.status(400).json({ error: `Report already ${report.status}` });

  report.reviewedAt = new Date().toISOString();
  report.reviewNotes = notes || '';

  switch (action) {
    case 'ban': {
      const d = banDuration || DEFAULT_BAN_DURATION_HOURS;
      const bi = { 
        deviceId: report.reportedDeviceId, 
        reason: report.reason, 
        timestamp: new Date().toISOString(), 
        expiresAt: d > 0 ? new Date(Date.now() + d * 3600000) : null, 
        durationHours: d > 0 ? d : null, 
        permanent: d === 0, 
        source: 'admin', 
        isHighPriority: report.isHighPriority,
        reportIds: [reportId] 
      };
      await banDeviceAndDisconnect(report.reportedDeviceId, bi);
      report.status = 'banned';
      break;
    }
    case 'dismiss': 
      report.status = 'dismissed'; 
      break;
    case 'warn': {
      report.status = 'warned';
      for (const [, s] of io.sockets.sockets) {
        if (s.data.deviceId === report.reportedDeviceId) {
          s.emit('warning', { reason: report.reason, message: 'You have received a warning for violating community guidelines.' });
        }
      }
      break;
    }
    default: return res.status(400).json({ error: 'Invalid action' });
  }
  await report.save();
  res.json({ success: true, report });
});

// ─── Admin Ban Endpoints ──────────────────────────────────────────────────────
app.post('/admin/ban-device', verifySession, async (req, res) => {
  const { deviceId, reason, durationHours } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const existing = isDeviceBanned(deviceId);
  if (existing) return res.status(400).json({ error: 'Device is already banned', existingBan: existing });
  const bi = { 
    deviceId, 
    reason: reason || 'Violation of terms', 
    timestamp: new Date().toISOString(), 
    expiresAt: durationHours ? new Date(Date.now() + durationHours * 3600000) : null, 
    durationHours: durationHours || null, 
    permanent: !durationHours, 
    source: 'manual',
    isHighPriority: false,
    reportIds: []
  };
  const dced = await banDeviceAndDisconnect(deviceId, bi);
  res.json({ success: true, deviceId: deviceId.substring(0, 12) + '...', banInfo: bi, socketsDisconnected: dced });
});

app.delete('/admin/ban-device/:deviceId', verifySession, async (req, res) => {
  let { deviceId } = req.params;
  try { deviceId = decodeURIComponent(deviceId); } catch (e) {}

  let found = null;
  if (bannedDevicesCache.has(deviceId)) {
    found = deviceId;
  } else {
    for (const [id] of bannedDevicesCache.entries()) {
      if (id.toLowerCase() === deviceId.toLowerCase() || id.includes(deviceId) || deviceId.includes(id)) { found = id; break; }
    }
  }
  if (!found) {
    const clean = deviceId.replace(/\.\.\.$/, '').replace(/[^A-Za-z0-9\-]/g, '');
    for (const [id] of bannedDevicesCache.entries()) { if (id.startsWith(clean)) { found = id; break; } }
  }

  if (!found) return res.status(404).json({ error: 'Device is not banned' });

  bannedDevicesCache.delete(found);
  await Ban.deleteOne({ deviceId: found });
  await ReportCount.updateOne({ deviceId: found }, { $set: { total: 0, highPriority: 0 } });
  console.log(`✅ Unbanned: ${found.substring(0, 12)}...`);
  res.json({ success: true, message: 'Device unbanned successfully' });
});

app.get('/admin/banned-devices', verifySession, async (req, res) => {
  for (const [deviceId, info] of bannedDevicesCache.entries()) {
    if (info.expiresAt && Date.now() > new Date(info.expiresAt).getTime()) {
      bannedDevicesCache.delete(deviceId);
      await Ban.deleteOne({ deviceId }).catch(() => {});
    }
  }
  const list = [...bannedDevicesCache.entries()].map(([deviceId, info]) => ({
    deviceId, reason: info.reason, timestamp: info.timestamp, expiresAt: info.expiresAt || null,
    permanent: info.permanent || false, isHighPriority: info.isHighPriority || false,
    source: info.source || 'manual',
  })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ bannedDevices: list, total: list.length });
});

app.get('/admin/stats', verifySession, async (req, res) => {
  res.json({
    activeConnections: io.engine.clientsCount, 
    activeRooms: rooms.size,
    bannedDevices: bannedDevicesCache.size,
    pendingReports:  await Report.countDocuments({ status: 'pending' }),
    totalNotifications: notificationsCache.length,
    activeAdminSessions: ADMIN_SESSIONS.size,
    uptime: process.uptime(),
    memoryMB: +(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
    safetySettings: appConfig.safety,
    dbState: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    genderStats: {
      ...genderMatcher.stats(),
      randomQueueLength: randomQueue.length,
    },
  });
});

// ─── Admin Panel & Static Files ───────────────────────────────────────────────
app.get('/admin', (_req, res) => {
  const adminPath = path.join(publicPath, 'admin.html');
  
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SERVICE_NAME} Admin</title>
  <style>
    body { font-family: system-ui; background: #0b0f17; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; background: #1e293b; padding: 2.5rem; border-radius: 24px; border: 1px solid #334155; }
    h1 { color: #3b82f6; }
    code { background: #0f172a; padding: 0.5rem 1rem; border-radius: 8px; color: #3b82f6; }
  </style>
</head>
<body>
  <div class="box">
    <h1>🔷 ${SERVICE_NAME} Admin</h1>
    <p>Admin panel file not found.</p>
    <p>Please add <code>admin.html</code> to:</p>
    <p><code>${publicPath}</code></p>
  </div>
</body>
</html>`);
  }
});

app.get('/admin.html', (_req, res) => res.redirect('/admin'));

// Serve static files from public directory
app.use(express.static(publicPath, { index: false }));

// Handle all other routes (including browser access to API)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
      if (isBrowserRequest(req)) {
        return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SERVICE_NAME}</title>
  <style>
    body { font-family: system-ui; background: #0b0f17; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; background: #1e293b; padding: 3rem; border-radius: 24px; border: 1px solid #334155; max-width: 500px; }
    h1 { color: #3b82f6; font-size: 2.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; }
    .status { display: inline-block; background: #065f46; color: #6ee7b7; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔷</div>
    <h1>${SERVICE_NAME}</h1>
    <p class="subtitle">Video Calling Platform</p>
    <span class="status">🟢 Service Running</span>
  </div>
</body>
</html>`);
      }
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.path === '/admin' || req.path === '/admin.html') {
      return res.status(404).json({ error: 'Not found' });
    }
    
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${SERVICE_NAME}</title>
  <style>
    body { font-family: system-ui; background: #0b0f17; color: #e2e8f0; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; background: #1e293b; padding: 3rem; border-radius: 24px; border: 1px solid #334155; max-width: 500px; }
    h1 { color: #3b82f6; font-size: 2.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: #94a3b8; font-size: 1.1rem; margin-bottom: 2rem; }
    .status { display: inline-block; background: #065f46; color: #6ee7b7; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔷</div>
    <h1>${SERVICE_NAME}</h1>
    <p class="subtitle">Video Calling Platform</p>
    <span class="status">🟢 Service Running</span>
  </div>
</body>
</html>`);
    }
  });
}

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id} (Total: ${io.engine.clientsCount})`);
  socket.emit('video-quality-config', { quality: appConfig.videoQuality, servers: ICE_SERVERS });
  socket.emit('safety-config', appConfig.safety);
  if (appConfig.maintenance.enabled) socket.emit('maintenance-mode', appConfig.maintenance);

  socket.on('register-device', ({ deviceId }) => {
    if (!deviceId) { socket.emit('device-error', { error: 'Device ID required' }); return; }
    const bi = isDeviceBanned(deviceId);
    if (bi) { socket.emit('device-banned', bi); socket.disconnect(true); return; }
    socket.data.deviceId = deviceId;
    socket.emit('device-registered', { deviceId, timestamp: new Date().toISOString(), safetySettings: appConfig.safety });
  });

  socket.on('report-user', async ({ reportedDeviceId, reportedUserId, reason, description }) => {
    const reporterDeviceId = socket.data.deviceId;
    if (!reporterDeviceId)                     { socket.emit('report-error', { error: 'Device not registered' }); return; }
    if (!reportedDeviceId || !reason)          { socket.emit('report-error', { error: 'reportedDeviceId and reason required' }); return; }
    if (reporterDeviceId === reportedDeviceId) { socket.emit('report-error', { error: 'Cannot report yourself' }); return; }

    const reportedDoc = await ReportCount.findOne({ deviceId: reportedDeviceId }).lean();
    if (reportedDoc?.reportedBy?.includes(reporterDeviceId)) { socket.emit('report-error', { error: 'Already reported' }); return; }

    const reportId = generateRoomId();
    const isHP = HIGH_PRIORITY_REASONS.includes(reason);
    const report = { id: reportId, reporterDeviceId, reportedDeviceId, reportedUserId: reportedUserId || null, reason, description: description || '', evidence: null, timestamp: new Date().toISOString(), status: 'pending', reviewedBy: null, reviewNotes: '', reviewedAt: null, autoBanned: false, isHighPriority: isHP };
    await Report.create(report);

    const counter = await ReportCount.findOneAndUpdate(
      { deviceId: reportedDeviceId },
      { $inc: { total: 1, ...(isHP ? { highPriority: 1 } : {}) }, $addToSet: { reportedBy: reporterDeviceId } },
      { upsert: true, new: true }
    );
    const cc = counter.total, hpc = counter.highPriority;
    console.log(`🚨 Socket Report #${reportId}: ${reportedDeviceId.substring(0, 12)}... for "${reason}"`);

    let ab = false;
    if ((isHP && hpc >= HIGH_PRIORITY_BAN_THRESHOLD) || (!isHP && cc >= AUTO_BAN_THRESHOLD)) {
      if (appConfig.safety.autoBanEnabled) {
        const bd = isHP ? 0 : DEFAULT_BAN_DURATION_HOURS;
        const bi = { deviceId: reportedDeviceId, reason: `Auto-banned: ${cc} reports`, timestamp: new Date().toISOString(), expiresAt: bd > 0 ? new Date(Date.now() + bd * 3600000) : null, durationHours: bd || null, permanent: bd === 0, source: 'auto', isHighPriority: isHP, reportIds: [] };
        await Report.updateMany({ reportedDeviceId }, { $set: { status: 'auto_banned', autoBanned: true } });
        await banDeviceAndDisconnect(reportedDeviceId, bi);
        ab = true;
      }
    }
    socket.emit('report-submitted', { success: true, reportId, reportCount: cc, autoBanned: ab });
  });

  socket.on('register-orey-id', ({ oreyId, userName }) => {
    cleanExpiredOreyIds();
    const validatedId = validateOreyId(oreyId);
    if (!validatedId) { socket.emit('orey-id-invalid', { error: 'Invalid ID format' }); return; }
    const entry = oreyIds.get(validatedId);
    if (!entry) { socket.emit('orey-id-invalid', { error: 'ID not found' }); return; }
    if (entry.expiresAt < Date.now()) { oreyIds.delete(validatedId); socket.emit('orey-id-expired'); return; }
    entry.socketId = socket.id;
    entry.userName = userName || 'Anonymous';
    socket.data.oreyId = validatedId;
    socket.data.userName = userName || 'Anonymous';
    socket.emit('orey-id-registered', { oreyId: validatedId, expiresAt: entry.expiresAt });
  });

  socket.on('connect-by-orey-id', ({ targetOreyId }) => {
    cleanExpiredOreyIds();
    const validatedId = validateOreyId(targetOreyId);
    if (!validatedId) { socket.emit('orey-id-invalid', { error: 'Invalid ID format' }); return; }
    const entry = oreyIds.get(validatedId);
    if (!entry) { socket.emit('orey-id-not-found'); return; }
    if (entry.expiresAt < Date.now()) { oreyIds.delete(validatedId); socket.emit('orey-id-expired'); return; }
    if (!entry.socketId) { socket.emit('orey-id-offline'); return; }
    const ts = io.sockets.sockets.get(entry.socketId);
    if (!ts) { entry.socketId = null; socket.emit('orey-id-offline'); return; }
    if (ts.id === socket.id) { socket.emit('orey-id-invalid', { error: 'Cannot call yourself' }); return; }

    const roomId = generateRoomId();
    rooms.set(roomId, new Map());
    socket.join(roomId);
    ts.join(roomId);

    const cd = { userName: socket.data.userName || 'Anonymous', oreyId: socket.data.oreyId || null, deviceId: socket.data.deviceId || null, gender: socket.data.gender || null };
    const calleeD = { userName: entry.userName, oreyId: validatedId, deviceId: ts.data.deviceId || null, gender: ts.data.gender || null };
    rooms.get(roomId).set(socket.id, cd);
    rooms.get(roomId).set(entry.socketId, calleeD);

    const rd = { roomId, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS };
    socket.emit('room-joined', { ...rd, peers: [{ socketId: entry.socketId, ...calleeD }] });
    ts.emit('room-joined', { ...rd, peers: [{ socketId: socket.id, ...cd }] });
    ts.emit('incoming-call', { fromName: cd.userName, fromOreyId: cd.oreyId });
  });

  // ─── Gender-aware random matching ───────────────────────────────────────────
  socket.on('join-random', () => {
    cancelAutoSearch(socket.id);
    removeFromQueue(socket.id);
    genderMatcher.dequeue(socket.id);          // clear from gender queues

    const gender = socket.data.gender || null;

    if (gender) {
      genderMatcher.enqueue(socket.id, gender); // gender-aware queue
    } else {
      randomQueue.push(socket.id);              // plain queue
    }

    socket.emit('waiting-for-match', {
      gender,
      genderStats: genderMatcher.stats(),
    });

    attemptMatch(socket.id);
  });

  socket.on('cancel-random', () => {
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);
    genderMatcher.dequeue(socket.id);          // also clear gender queues
    socket.emit('random-cancelled');
  });

  // ─── Set gender event ──────────────────────────────────────────────────────
  socket.on('set-gender', ({ gender }) => {
    const normalised = genderMatcher.normalise(gender); // 'male'|'female'|null

    socket.data.gender = normalised;

    // If already queued in plain random, switch to gender queue
    const inRandom = randomQueue.includes(socket.id);
    if (inRandom && normalised) {
      removeFromQueue(socket.id);
      genderMatcher.enqueue(socket.id, normalised);
      attemptMatch(socket.id);
    }

    socket.emit('gender-set', {
      gender:   normalised,
      accepted: normalised !== null,
      message:  normalised
        ? `Matching you with ${normalised === 'male' ? 'females' : 'males'} first.`
        : 'Gender cleared — standard random matching.',
    });

    console.log(`⚧  Gender: ${socket.id.slice(0, 8)} → ${normalised ?? 'none'}`);
  });

  socket.on('join-room', ({ roomId, userName }) => {
    socket.data.userName = userName || 'Anonymous';
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const r = rooms.get(roomId);
    if (r.size >= 2) { socket.emit('room-full'); return; }
    socket.join(roomId);
    r.set(socket.id, { userName: socket.data.userName, oreyId: socket.data.oreyId || null, deviceId: socket.data.deviceId || null, gender: socket.data.gender || null });
    const peers = [...r.entries()].filter(([id]) => id !== socket.id).map(([socketId, data]) => ({ socketId, ...data }));
    socket.emit('room-joined', { roomId, peers, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS });
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName: socket.data.userName });
  });

  socket.on('offer',         ({ targetId, offer    }) => io.to(targetId).emit('offer',         { offer,     fromId: socket.id }));
  socket.on('answer',        ({ targetId, answer   }) => io.to(targetId).emit('answer',        { answer,    fromId: socket.id }));
  socket.on('ice-candidate', ({ targetId, candidate}) => io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id }));
  socket.on('media-state',   ({ roomId, audioEnabled, videoEnabled }) => socket.to(roomId).emit('peer-media-state', { socketId: socket.id, audioEnabled, videoEnabled }));

  // ─── Chat Message Handler ───────────────────────────────────────────────────
  socket.on('chat-message', ({ roomId, message, type }) => {
    if (!roomId || !message) {
      socket.emit('chat-error', { error: 'roomId and message are required' });
      return;
    }
    
    const room = rooms.get(roomId);
    if (!room || !room.has(socket.id)) {
      socket.emit('chat-error', { error: 'Not in this room' });
      return;
    }
    
    const chatMessage = {
      id: generateRoomId(),
      senderId: socket.id,
      senderName: socket.data.userName || 'Anonymous',
      message: message.substring(0, 500), // Limit message length
      type: type || 'text',
      timestamp: new Date().toISOString(),
      roomId
    };
    
    // Send to all in room including sender (for confirmation)
    io.to(roomId).emit('chat-message', chatMessage);
    
    console.log(`💬 Chat [${roomId}]: ${socket.data.userName || 'Anonymous'}: ${message.substring(0, 50)}`);
  });

  // ─── Chat Typing Indicator ──────────────────────────────────────────────────
  socket.on('chat-typing', ({ roomId, isTyping }) => {
    socket.to(roomId).emit('peer-typing', {
      socketId: socket.id,
      userName: socket.data.userName || 'Anonymous',
      isTyping
    });
  });

  socket.on('skip', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      [...room.keys()].filter(id => id !== socket.id).forEach(pid => {
        const ps = io.sockets.sockets.get(pid);
        if (ps) { room.delete(pid); ps.leave(roomId); ps.emit('partner-left', { socketId: socket.id, reason: 'skip' }); scheduleAutoSearch(ps); }
      });
      room.delete(socket.id); socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('skip-confirmed');
    removeFromQueue(socket.id);
    randomQueue.push(socket.id);
    socket.emit('waiting-for-match');
    attemptMatch(socket.id);
  });

  socket.on('leave-chat', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      [...room.keys()].filter(id => id !== socket.id).forEach(pid => {
        const ps = io.sockets.sockets.get(pid);
        if (ps) { ps.emit('partner-left', { socketId: socket.id, reason: 'left' }); scheduleAutoSearch(ps); }
      });
      room.delete(socket.id); socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('left-chat-confirmed');
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    removeFromQueue(socket.id);
    genderMatcher.dequeue(socket.id);
    cancelAutoSearch(socket.id);
    if (socket.data.oreyId) {
      const entry = oreyIds.get(socket.data.oreyId);
      if (entry && entry.socketId === socket.id) entry.socketId = null;
    }
    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const ps = io.sockets.sockets.get(pid);
        if (ps) { ps.emit('partner-left', { socketId: socket.id, reason: 'disconnect' }); scheduleAutoSearch(ps); }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
  });
});

// ─── Periodic Cleanup ─────────────────────────────────────────────────────────
setInterval(() => {
  const before = notificationsCache.length;
  notificationsCache = notificationsCache.filter(n => !isNotifExpired(n));
  const cleaned = before - notificationsCache.length;
  if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} expired notifications`);
}, 3600000);

setInterval(cleanExpiredOreyIds, 10 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of ADMIN_SESSIONS.entries()) {
    if (data.expiresAt < now) ADMIN_SESSIONS.delete(token);
  }
}, 15 * 60 * 1000);

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 ${SERVICE_NAME} Server Running`);
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`📂 Public Path: ${publicPath}`);
      console.log(`🖥️  Admin Panel: http://localhost:${PORT}/admin`);
      console.log(`🔐 Admin Login: POST /admin/login`);
      console.log(`🆔 ID Format: OREY-XXXXX (5 characters)`);
      console.log(`🚫 Auto-Ban: ${AUTO_BAN_THRESHOLD} reports`);
      console.log(`🔔 Notification System: ACTIVE`);
      console.log(`💬 Chat System: ACTIVE`);
      console.log(`⚧  Gender Matchmaking: ACTIVE`);
      console.log(`🔒 Browser API Protection: ENABLED`);
      console.log(`🗄️  Database: MongoDB`);
      console.log(`⏱️  Admin Session: ${SESSION_DURATION_MS / (60 * 60 * 1000)} hours`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
}

start();
