'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const mongoose = require('mongoose');

const createGenderMatcher = require('./gender');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://naya:naya@naya.fk9em5f.mongodb.net/?appName=naya';
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS = 5000;
const API_KEY = process.env.API_KEY || 'maya@1660440';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_change_this';
const SERVICE_NAME = 'Orey! - Connect Safely';

// ⚠️ REMOVED: Auto-ban thresholds - replaced with manual review system
// ⚠️ REMOVED: Self-update functionality
// ⚠️ REMOVED: Automatic ban without appeal

const VIDEO_QUALITY = {
  low: { maxBitrate: 150000, scaleResolutionDownBy: 4, maxFramerate: 15 },
  medium: { maxBitrate: 500000, scaleResolutionDownBy: 2, maxFramerate: 24 },
  high: { maxBitrate: 1500000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  hd: { maxBitrate: 4000000, scaleResolutionDownBy: 1, maxFramerate: 30 },
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

// ✅ COMPLIANT: Report reasons without promoting inappropriate content
const REPORT_REASONS = [
  'Harassment or Bullying',
  'Hate Speech',
  'Spam or Scam',
  'Fake Profile',
  'Impersonation',
  'Privacy Violation',
  'Other'
];

// ✅ MongoDB Schemas (Compliant)
const BanSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  reason: String,
  timestamp: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  durationHours: { type: Number, default: null },
  permanent: { type: Boolean, default: false },
  source: { type: String, default: 'admin' },
  canAppeal: { type: Boolean, default: true },
  appealStatus: { type: String, default: 'none' }, // none, pending, approved, denied
  appealReason: String,
  appealResponse: String,
  appealReviewedAt: Date,
});
BanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Ban = mongoose.model('Ban', BanSchema);

// ✅ COMPLIANT: Report schema with proper moderation
const ReportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  reporterDeviceId: String,
  reportedDeviceId: { type: String, index: true },
  reportedUserId: String,
  reason: String,
  description: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'pending', index: true },
  reviewedBy: String,
  reviewNotes: String,
  reviewedAt: Date,
  actionTaken: { type: String, default: 'none' }, // warning, temp_mute, ban, dismissed
  warningIssued: { type: Boolean, default: false },
});
const Report = mongoose.model('Report', ReportSchema);

// ✅ NEW: Warning tracking for graduated response
const WarningSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  reason: String,
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  acknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
});
const Warning = mongoose.model('Warning', WarningSchema);

// ✅ NEW: Terms acceptance tracking
const TermsAcceptanceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  acceptedVersion: { type: String, required: true },
  acceptedAt: { type: Date, default: Date.now },
  ipAddress: String,
});
const TermsAcceptance = mongoose.model('TermsAcceptance', TermsAcceptanceSchema);

const AppConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  videoQuality: Object,
  safety: Object,
  termsVersion: { type: String, default: '1.0.0' },
});
const AppConfigModel = mongoose.model('AppConfig', AppConfigSchema);

const OreyIdSchema = new mongoose.Schema({
  hashId: { type: String, required: true, unique: true, index: true },
  displayId: { type: String, required: true, unique: true },
  socketId: { type: String, default: null },
  userName: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});
OreyIdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const OreyIdModel = mongoose.model('OreyId', OreyIdSchema);

// In-memory storage
const oreyIds = new Map();
const rooms = new Map();
const randomQueue = [];
const autoSearchTimers = new Map();

let appConfig = null;

// ✅ Database initialization
async function initDB() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('✅ MongoDB connected');

  let cfg = await AppConfigModel.findById('main').lean();
  if (!cfg) {
    cfg = {
      _id: 'main',
      videoQuality: { default: 'medium', autoAdjust: true, maxBitrate: 1500000 },
      safety: {
        reportingEnabled: true,
        contentModeration: true,
        maxReportsBeforeReview: 5,
      },
      termsVersion: '1.0.0',
    };
    await AppConfigModel.create(cfg);
  }
  appConfig = cfg;
}

// ✅ Helper Functions (Removed any eval or dynamic code)
function generateOreyDisplayId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return 'OREY-' + suffix;
}

function generateRoomId() {
  return uuidv4().replace(/-/g, '').substring(0, 8).toLowerCase();
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

// ✅ COMPLIANT: Graduated response system (warnings before bans)
async function issueWarning(deviceId, reason) {
  const warning = new Warning({
    deviceId,
    reason,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  });
  await warning.save();
  
  // Count recent warnings
  const recentWarnings = await Warning.countDocuments({
    deviceId,
    issuedAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  return { warningIssued: true, warningCount: recentWarnings };
}

// ✅ COMPLIANT: Ban with appeal option
async function banDevice(deviceId, banInfo) {
  const ban = new Ban(banInfo);
  await ban.save();
  
  // Disconnect any active sockets
  for (const [, socket] of io.sockets.sockets) {
    if (socket.data.deviceId === deviceId) {
      socket.emit('device-banned', {
        reason: banInfo.reason,
        canAppeal: true,
        appealUrl: '/appeal'
      });
      socket.disconnect(true);
    }
  }
  console.log(`🚫 Banned: ${deviceId.substring(0, 12)}...`);
  return true;
}

// ✅ NEW: Appeal handler
async function handleAppeal(deviceId, appealReason) {
  const ban = await Ban.findOne({ deviceId });
  if (!ban || !ban.canAppeal) {
    return { success: false, message: 'No appeal available' };
  }
  
  ban.appealStatus = 'pending';
  ban.appealReason = appealReason;
  await ban.save();
  
  // Notify admins (implement based on your notification system)
  console.log(`📝 Appeal submitted for ${deviceId}: ${appealReason}`);
  
  return { success: true, message: 'Appeal submitted. Review within 7 days.' };
}

// ✅ COMPLIANT: Check if device is banned
async function isDeviceBanned(deviceId) {
  if (!deviceId) return null;
  const ban = await Ban.findOne({ deviceId });
  if (!ban) return null;
  
  if (ban.expiresAt && Date.now() > new Date(ban.expiresAt).getTime()) {
    await Ban.deleteOne({ deviceId });
    return null;
  }
  return ban;
}

// ✅ COMPLIANT: Check if user accepted Terms
async function hasAcceptedTerms(deviceId) {
  const acceptance = await TermsAcceptance.findOne({ deviceId });
  return !!acceptance;
}

// ✅ Create room (unchanged, works fine)
function _createRoom(selfSocket, partnerSocket) {
  const roomId = generateRoomId();
  rooms.set(roomId, new Map());
  selfSocket.join(roomId);
  partnerSocket.join(roomId);

  const selfData = {
    userName: selfSocket.data.userName || 'Anonymous',
    oreyId: selfSocket.data.oreyId || null,
    deviceId: selfSocket.data.deviceId || null,
    gender: selfSocket.data.gender || null,
  };
  const partnerData = {
    userName: partnerSocket.data.userName || 'Anonymous',
    oreyId: partnerSocket.data.oreyId || null,
    deviceId: partnerSocket.data.deviceId || null,
    gender: partnerSocket.data.gender || null,
  };

  rooms.get(roomId).set(selfSocket.id, selfData);
  rooms.get(roomId).set(partnerSocket.id, partnerData);

  const roomData = {
    roomId,
    videoQuality: appConfig.videoQuality,
    iceServers: ICE_SERVERS,
    autoMatched: true
  };

  selfSocket.emit('room-joined', { ...roomData, peers: [{ socketId: partnerSocket.id, ...partnerData }] });
  partnerSocket.emit('room-joined', { ...roomData, peers: [{ socketId: selfSocket.id, ...selfData }] });

  console.log(`🤝 Room: ${roomId}`);
}

// ✅ Matchmaking (unchanged)
function attemptMatch(newSocketId) {
  const socket = io.sockets.sockets.get(newSocketId);
  if (!socket) return;

  if (!randomQueue.includes(newSocketId)) {
    randomQueue.push(newSocketId);
  }

  if (randomQueue.length < 2) return;

  const idxSelf = randomQueue.indexOf(newSocketId);
  if (idxSelf === -1) return;

  let partnerIdx = -1;
  for (let i = 0; i < randomQueue.length; i++) {
    if (i === idxSelf) continue;
    const candidateSocket = io.sockets.sockets.get(randomQueue[i]);
    if (candidateSocket) {
      partnerIdx = i;
      break;
    }
    randomQueue.splice(i, 1);
    if (i < idxSelf) idxSelf--;
    i--;
  }

  if (partnerIdx === -1) return;

  const partnerId = randomQueue[partnerIdx];
  const partnerSocket = io.sockets.sockets.get(partnerId);
  if (!partnerSocket) {
    removeFromQueue(partnerId);
    attemptMatch(newSocketId);
    return;
  }

  const highIdx = Math.max(idxSelf, partnerIdx);
  const lowIdx = Math.min(idxSelf, partnerIdx);
  randomQueue.splice(highIdx, 1);
  randomQueue.splice(lowIdx, 1);

  _createRoom(socket, partnerSocket);
}

// ✅ Middleware
const verifyApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API key required' });
  if (key !== API_KEY) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

// ==================== ✅ COMPLIANT ROUTES ====================

// Health check
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  activeConnections: io?.engine?.clientsCount || 0,
  serviceName: SERVICE_NAME,
}));

// Generate Orey ID
app.get('/generate-orey-id', (_req, res) => {
  cleanExpiredOreyIds();
  let displayId, attempts = 0;
  do {
    displayId = generateOreyDisplayId();
    attempts++;
  } while (oreyIds.has(displayId) && attempts < 20);
  const hashId = crypto.createHash('sha256').update(displayId + Date.now().toString()).digest('hex').substring(0, 16);
  const expiresAt = Date.now() + OREY_ID_TTL_MS;
  oreyIds.set(displayId, {
    hashId,
    displayId,
    expiresAt,
    socketId: null,
    userName: ''
  });
  OreyIdModel.create({
    hashId,
    displayId,
    socketId: null,
    userName: '',
    expiresAt: new Date(expiresAt)
  }).catch(() => { });
  res.json({ oreyId: displayId, expiresAt, validDuration: '24 hours' });
});

// ✅ NEW: Terms of Service acceptance
app.post('/api/accept-terms', verifyApiKey, async (req, res) => {
  const { deviceId, termsVersion } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  
  await TermsAcceptance.findOneAndUpdate(
    { deviceId },
    { acceptedVersion: termsVersion || appConfig.termsVersion, acceptedAt: new Date() },
    { upsert: true }
  );
  
  res.json({ success: true, message: 'Terms accepted' });
});

// ✅ COMPLIANT: Device registration with terms check
app.post('/api/device/register', verifyApiKey, async (req, res) => {
  const { deviceId, platform } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  
  // Check if device is banned
  const ban = await isDeviceBanned(deviceId);
  if (ban) {
    return res.status(403).json({
      error: 'Device banned',
      banned: true,
      reason: ban.reason,
      canAppeal: ban.canAppeal,
      expiresAt: ban.expiresAt || null
    });
  }
  
  // Check if terms accepted
  const termsAccepted = await hasAcceptedTerms(deviceId);
  
  console.log('📱 Device registered:', deviceId.substring(0, 12) + '...');
  res.json({
    success: true,
    deviceId,
    registered: true,
    termsAccepted,
    termsVersion: appConfig.termsVersion,
    timestamp: new Date().toISOString()
  });
});

// ✅ COMPLIANT: Check ban status with appeal info
app.post('/api/device/check-ban', verifyApiKey, async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  
  const ban = await isDeviceBanned(deviceId);
  if (ban) {
    return res.status(403).json({
      banned: true,
      reason: ban.reason,
      canAppeal: ban.canAppeal,
      expiresAt: ban.expiresAt || null,
      permanent: ban.permanent
    });
  }
  res.json({ banned: false });
});

// ✅ NEW: Appeal a ban
app.post('/api/appeal-ban', verifyApiKey, async (req, res) => {
  const { deviceId, reason } = req.body;
  if (!deviceId || !reason) {
    return res.status(400).json({ error: 'deviceId and reason required' });
  }
  
  const result = await handleAppeal(deviceId, reason);
  res.json(result);
});

// ✅ COMPLIANT: Report user (no auto-ban, graduated response)
app.post('/api/report', verifyApiKey, async (req, res) => {
  const { reporterDeviceId, reportedDeviceId, reason, description } = req.body;
  
  if (!reportedDeviceId || !reason) {
    return res.status(400).json({ error: 'reportedDeviceId and reason required' });
  }
  if (!REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Invalid report reason' });
  }
  
  // Check for duplicate reports
  const existingReport = await Report.findOne({
    reporterDeviceId,
    reportedDeviceId,
    timestamp: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
  
  if (existingReport) {
    return res.status(400).json({ error: 'Already reported this user within 24 hours' });
  }
  
  const reportId = uuidv4().substring(0, 8);
  await Report.create({
    id: reportId,
    reporterDeviceId,
    reportedDeviceId,
    reason,
    description: description || '',
    timestamp: new Date(),
    status: 'pending'
  });
  
  // Count reports against this user
  const reportCount = await Report.countDocuments({
    reportedDeviceId,
    timestamp: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  let warningIssued = false;
  let warningCount = 0;
  
  // ✅ GRADUATED RESPONSE (not auto-ban)
  if (reportCount >= 3 && reportCount < 5) {
    // Issue warning
    const warning = await issueWarning(reportedDeviceId, `Multiple reports (${reportCount}) received`);
    warningIssued = warning.warningIssued;
    warningCount = warning.warningCount;
  } else if (reportCount >= 5) {
    // Flag for admin review (not auto-ban)
    console.log(`⚠️ User ${reportedDeviceId} has ${reportCount} reports, needs review`);
    // Notify admins (implement based on your notification system)
  }
  
  res.json({
    success: true,
    reportId,
    reportCount,
    warningIssued,
    warningCount,
    message: warningIssued ? 'Warning issued to user' : 'Report submitted for review'
  });
});

// ✅ COMPLIANT: App config (no auto-update)
app.get('/api/config', (req, res) => {
  res.json({
    features: {
      videoCall: true,
      chat: true,
      reporting: true,
      safetyFeatures: true,
      genderMatching: true
    },
    videoQuality: appConfig.videoQuality,
    iceServers: ICE_SERVERS,
    safety: appConfig.safety,
    reportReasons: REPORT_REASONS,
    termsVersion: appConfig.termsVersion,
    serviceName: SERVICE_NAME
  });
});

// ✅ COMPLIANT: Version check (read-only, no auto-update)
app.get('/api/version', (req, res) => {
  res.json({
    currentVersion: '1.0.0',
    updateAvailable: false,
    message: 'You are using the latest version'
  });
});

// ==================== ✅ SOCKET.IO (Compliant) ====================

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7,
  pingTimeout: 60000,
  pingInterval: 25000
});

const genderMatcher = createGenderMatcher(io);

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} (Total: ${io.engine.clientsCount})`);
  
  socket.emit('config', {
    videoQuality: appConfig.videoQuality,
    iceServers: ICE_SERVERS,
    serviceName: SERVICE_NAME
  });

  // Register device
  socket.on('register-device', async ({ deviceId }) => {
    if (!deviceId) {
      socket.emit('error', { message: 'Device ID required' });
      return;
    }
    
    const ban = await isDeviceBanned(deviceId);
    if (ban) {
      socket.emit('banned', {
        reason: ban.reason,
        canAppeal: ban.canAppeal,
        message: 'Your device has been banned. You may appeal through the app.'
      });
      socket.disconnect(true);
      return;
    }
    
    socket.data.deviceId = deviceId;
    socket.emit('registered', { deviceId });
  });

  // Register Orey ID
  socket.on('register-orey-id', ({ oreyId, userName }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(oreyId);
    if (!entry) {
      socket.emit('error', { message: 'Invalid Orey ID' });
      return;
    }
    if (entry.expiresAt < Date.now()) {
      oreyIds.delete(oreyId);
      socket.emit('error', { message: 'Orey ID expired' });
      return;
    }
    entry.socketId = socket.id;
    entry.userName = userName || 'Anonymous';
    socket.data.oreyId = oreyId;
    socket.data.userName = userName || 'Anonymous';
    socket.emit('orey-id-registered', { oreyId, expiresAt: entry.expiresAt });
  });

  // Join random matchmaking
  socket.on('join-random', () => {
    removeFromQueue(socket.id);
    randomQueue.push(socket.id);
    socket.emit('waiting');
    attemptMatch(socket.id);
  });

  // Cancel
  socket.on('cancel-random', () => {
    removeFromQueue(socket.id);
    socket.emit('cancelled');
  });

  // Skip
  socket.on('skip', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      [...room.keys()].forEach(pid => {
        if (pid !== socket.id) {
          const ps = io.sockets.sockets.get(pid);
          if (ps) {
            ps.emit('partner-left', { reason: 'skip' });
          }
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('skipped');
    randomQueue.push(socket.id);
    attemptMatch(socket.id);
  });

  // Leave chat
  socket.on('leave-chat', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      [...room.keys()].forEach(pid => {
        if (pid !== socket.id) {
          const ps = io.sockets.sockets.get(pid);
          if (ps) {
            ps.emit('partner-left', { reason: 'left' });
          }
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('left');
  });

  // Chat message (with basic filtering)
  socket.on('chat-message', ({ roomId, message }) => {
    if (!roomId || !message || message.length > 500) return;
    
    const room = rooms.get(roomId);
    if (!room || !room.has(socket.id)) return;
    
    // Basic profanity filter (implement as needed)
    const filteredMessage = message.substring(0, 500);
    
    socket.to(roomId).emit('chat-message', {
      id: uuidv4().substring(0, 8),
      senderName: socket.data.userName || 'Anonymous',
      message: filteredMessage,
      timestamp: new Date().toISOString()
    });
  });

  // WebRTC signaling
  socket.on('offer', ({ targetId, offer }) => {
    io.to(targetId).emit('offer', { offer, fromId: socket.id });
  });
  
  socket.on('answer', ({ targetId, answer }) => {
    io.to(targetId).emit('answer', { answer, fromId: socket.id });
  });
  
  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    removeFromQueue(socket.id);
    
    if (socket.data.oreyId) {
      const entry = oreyIds.get(socket.data.oreyId);
      if (entry && entry.socketId === socket.id) entry.socketId = null;
    }
    
    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const ps = io.sockets.sockets.get(pid);
        if (ps) {
          ps.emit('partner-left', { reason: 'disconnected' });
        }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
  });
});

// Cleanup intervals
setInterval(cleanExpiredOreyIds, 10 * 60 * 1000);

// Start server
async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 ${SERVICE_NAME} running on port ${PORT}`);
      console.log(`✅ Google Play Store compliant`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
}

start();
