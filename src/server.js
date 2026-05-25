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
const admin = require('firebase-admin');
const { OAuth2Client } = require('google-auth-library');

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

// Optional rate limiting (uncomment if needed)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100,
//   message: { error: 'Too many requests, please try again later.' }
// });
// app.use('/api/', limiter);

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://naya:naya@naya.fk9em5f.mongodb.net/?appName=naya';
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS = 5000;
const API_KEY = process.env.API_KEY || 'maya@1660440';
const ADMIN_KEY = process.env.ADMIN_KEY || 'maya@1660440';
const SERVICE_NAME = 'Orey! - Connect Safely';

// ✅ Google OAuth2 Client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/auth/google/callback';

const googleOAuth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// ✅ Firebase Admin Initialization
let firebaseApp = null;
try {
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '',
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID || '',
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`,
      universe_domain: "googleapis.com"
    };
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    });
    console.log('✅ Firebase Admin initialized');
  } else {
    console.log('⚠️ Firebase not configured');
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
}

// Video quality configuration
const VIDEO_QUALITY = {
  low: { 
    maxBitrate: 150000, 
    scaleResolutionDownBy: 4, 
    maxFramerate: 15,
    label: 'Low (Data Saver)',
    description: '240p, optimized for slow connections'
  },
  medium: { 
    maxBitrate: 500000, 
    scaleResolutionDownBy: 2, 
    maxFramerate: 24,
    label: 'Medium',
    description: '480p, balanced quality'
  },
  high: { 
    maxBitrate: 1500000, 
    scaleResolutionDownBy: 1, 
    maxFramerate: 30,
    label: 'High',
    description: '720p, recommended for WiFi'
  },
  hd: { 
    maxBitrate: 4000000, 
    scaleResolutionDownBy: 1, 
    maxFramerate: 30,
    label: 'HD',
    description: '1080p, requires strong connection'
  },
};

const QUALITY_SWITCH_MODES = {
  manual: 'User manually selects quality',
  auto: 'Server adjusts based on network conditions',
  hybrid: 'User sets max, server can lower if needed'
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

const REPORT_REASONS = [
  'Harassment or Bullying',
  'Hate Speech',
  'Spam or Scam',
  'Fake Profile',
  'Impersonation',
  'Privacy Violation',
  'Inappropriate Content',
  'Other'
];

// MongoDB Schemas
const BanSchema = new mongoose.Schema({
  deviceId: { type: String, index: true },
  firebaseUid: { type: String, index: true },
  reason: String,
  timestamp: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  durationHours: { type: Number, default: null },
  permanent: { type: Boolean, default: false },
  source: { type: String, default: 'admin' },
  canAppeal: { type: Boolean, default: true },
  appealStatus: { type: String, default: 'none' },
  appealReason: String,
  appealResponse: String,
  appealReviewedAt: Date,
});
BanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
BanSchema.index({ firebaseUid: 1, deviceId: 1 });
const Ban = mongoose.model('Ban', BanSchema);

const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, unique: true },
  displayName: String,
  photoURL: String,
  oreyId: { type: String, unique: true, sparse: true, index: true },
  deviceId: String,
  ageVerified: { type: Boolean, default: false },
  birthDate: Date,
  gender: { 
    type: String, 
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    default: 'prefer_not_to_say'
  },
  genderVerified: { type: Boolean, default: false },
  termsAccepted: { type: Boolean, default: false },
  termsVersion: String,
  videoQualityPreference: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'hd'],
    default: 'medium'
  },
  qualitySwitchMode: {
    type: String,
    enum: ['manual', 'auto', 'hybrid'],
    default: 'hybrid'
  },
  isInCall: { type: Boolean, default: false },
  currentRoomId: { type: String, default: null },
  totalCalls: { type: Number, default: 0 },
  totalCallDuration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  lastActive: Date,
  isActive: { type: Boolean, default: true }
});
const User = mongoose.model('User', UserSchema);

const CallHistorySchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  callerFirebaseUid: String,
  receiverFirebaseUid: String,
  callerDeviceId: String,
  receiverDeviceId: String,
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  duration: { type: Number, default: 0 },
  endedBy: String,
  callQuality: String,
  wasReported: { type: Boolean, default: false },
});
const CallHistory = mongoose.model('CallHistory', CallHistorySchema);

const ReportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  reporterDeviceId: String,
  reporterFirebaseUid: String,
  reportedDeviceId: { type: String, index: true },
  reportedFirebaseUid: { type: String, index: true },
  reportedUserId: String,
  roomId: String,
  reason: String,
  description: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'pending', index: true },
  reviewedBy: String,
  reviewNotes: String,
  reviewedAt: Date,
  actionTaken: { type: String, default: 'none' },
  warningIssued: { type: Boolean, default: false },
});
const Report = mongoose.model('Report', ReportSchema);

const WarningSchema = new mongoose.Schema({
  deviceId: { type: String, index: true },
  firebaseUid: { type: String, index: true },
  reason: String,
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  acknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
});
const Warning = mongoose.model('Warning', WarningSchema);

const AppConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  videoQuality: {
    default: { type: String, default: 'medium' },
    autoAdjust: { type: Boolean, default: true },
    maxBitrate: { type: Number, default: 1500000 },
    allowedQualities: [{ type: String }],
    adaptiveBitrate: { type: Boolean, default: true },
    networkThresholds: {
      excellent: { type: Number, default: 5000 },
      good: { type: Number, default: 2000 },
      fair: { type: Number, default: 800 },
      poor: { type: Number, default: 300 }
    }
  },
  safety: Object,
  termsVersion: { type: String, default: '1.0.0' },
});
const AppConfigModel = mongoose.model('AppConfig', AppConfigSchema);

const OreyIdSchema = new mongoose.Schema({
  hashId: { type: String, required: true, unique: true, index: true },
  displayId: { type: String, required: true, unique: true },
  socketId: { type: String, default: null },
  firebaseUid: { type: String, index: true },
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
const activeCalls = new Map();

let appConfig = null;

// Helper Functions
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

function estimateNetworkQuality(socket) {
  const ping = socket.conn.transport.name === 'websocket' ? 30 : 100;
  const transport = socket.conn.transport.name;
  
  if (transport === 'websocket' && ping < 50) return 'excellent';
  if (ping < 100) return 'good';
  if (ping < 200) return 'fair';
  return 'poor';
}

function getAdaptiveQuality(networkQuality, userPreference) {
  const qualityMap = {
    'excellent': 'hd',
    'good': 'high',
    'fair': 'medium',
    'poor': 'low'
  };
  
  const recommendedQuality = qualityMap[networkQuality] || 'medium';
  const qualityOrder = ['low', 'medium', 'high', 'hd'];
  const recommendedIndex = qualityOrder.indexOf(recommendedQuality);
  const preferredIndex = qualityOrder.indexOf(userPreference || 'medium');
  
  return qualityOrder[Math.min(recommendedIndex, preferredIndex)];
}

async function issueWarning(deviceId, firebaseUid, reason) {
  const warning = new Warning({
    deviceId,
    firebaseUid,
    reason,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await warning.save();
  
  const recentWarnings = await Warning.countDocuments({
    $or: [{ firebaseUid }, { deviceId }],
    issuedAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  return { warningIssued: true, warningCount: recentWarnings };
}

async function banDevice(deviceId, firebaseUid, banInfo) {
  const ban = new Ban({ ...banInfo, deviceId, firebaseUid });
  await ban.save();
  
  for (const [, socket] of io.sockets.sockets) {
    if (socket.data.deviceId === deviceId || socket.data.firebaseUid === firebaseUid) {
      socket.emit('device-banned', {
        reason: banInfo.reason,
        canAppeal: true,
        appealUrl: '/appeal'
      });
      socket.disconnect(true);
    }
  }
  console.log(`🚫 Banned: ${firebaseUid || deviceId?.substring(0, 12)}...`);
  return true;
}

async function handleAppeal(deviceId, firebaseUid, appealReason) {
  const query = firebaseUid ? { firebaseUid } : { deviceId };
  const ban = await Ban.findOne(query);
  if (!ban || !ban.canAppeal) {
    return { success: false, message: 'No appeal available' };
  }
  
  ban.appealStatus = 'pending';
  ban.appealReason = appealReason;
  await ban.save();
  
  console.log(`📝 Appeal submitted: ${appealReason}`);
  return { success: true, message: 'Appeal submitted. Review within 7 days.' };
}

async function isDeviceBanned(deviceId, firebaseUid) {
  const query = firebaseUid ? { $or: [{ firebaseUid }, { deviceId }] } : { deviceId };
  const ban = await Ban.findOne(query);
  if (!ban) return null;
  
  if (ban.expiresAt && Date.now() > new Date(ban.expiresAt).getTime()) {
    await Ban.deleteOne({ _id: ban._id });
    return null;
  }
  return ban;
}

async function isUserVerified(firebaseUid) {
  if (!firebaseUid) return false;
  const user = await User.findOne({ firebaseUid });
  if (!user) return false;
  return user.termsAccepted && user.ageVerified;
}

// Shared user upsert logic
async function upsertUserFromGoogle({ uid, email, name, picture }) {
  let user = await User.findOne({ firebaseUid: uid });

  if (!user) {
    const existingEmail = await User.findOne({ email });
    if (existingEmail) return { user: null, conflict: true };

    let displayId, attempts = 0;
    do {
      displayId = generateOreyDisplayId();
      attempts++;
    } while (await User.findOne({ oreyId: displayId }) && attempts < 20);

    user = new User({
      firebaseUid: uid,
      email,
      displayName: name || email.split('@')[0],
      photoURL: picture || '',
      oreyId: displayId,
      lastLogin: new Date(),
      lastActive: new Date(),
      videoQualityPreference: 'medium',
      qualitySwitchMode: 'hybrid'
    });

    const hashId = crypto.createHash('sha256').update(displayId + uid).digest('hex').substring(0, 16);
    const expiresAt = Date.now() + OREY_ID_TTL_MS;

    oreyIds.set(displayId, {
      hashId, displayId, expiresAt, socketId: null,
      userName: user.displayName, firebaseUid: uid
    });

    await OreyIdModel.create({
      hashId, displayId, socketId: null,
      userName: user.displayName,
      expiresAt: new Date(expiresAt),
      firebaseUid: uid
    }).catch(err => console.error('OreyId creation error:', err));
  } else {
    user.lastLogin = new Date();
    user.lastActive = new Date();
  }

  await user.save();
  return { user, conflict: false };
}

function _createRoom(selfSocket, partnerSocket) {
  const roomId = generateRoomId();
  const startTime = Date.now();
  
  rooms.set(roomId, new Map());
  selfSocket.join(roomId);
  partnerSocket.join(roomId);

  const selfData = {
    userName: selfSocket.data.userName || 'Anonymous',
    oreyId: selfSocket.data.oreyId || null,
    deviceId: selfSocket.data.deviceId || null,
    gender: selfSocket.data.gender || null,
    firebaseUid: selfSocket.data.firebaseUid || null,
    videoQuality: selfSocket.data.videoQuality || 'medium',
  };
  const partnerData = {
    userName: partnerSocket.data.userName || 'Anonymous',
    oreyId: partnerSocket.data.oreyId || null,
    deviceId: partnerSocket.data.deviceId || null,
    gender: partnerSocket.data.gender || null,
    firebaseUid: partnerSocket.data.firebaseUid || null,
    videoQuality: partnerSocket.data.videoQuality || 'medium',
  };

  rooms.get(roomId).set(selfSocket.id, { ...selfData, joinedAt: startTime });
  rooms.get(roomId).set(partnerSocket.id, { ...partnerData, joinedAt: startTime });

  activeCalls.set(roomId, {
    roomId,
    startTime,
    participants: [selfSocket.id, partnerSocket.id],
    callerUid: selfSocket.data.firebaseUid,
    receiverUid: partnerSocket.data.firebaseUid
  });

  if (selfSocket.data.firebaseUid) {
    User.findOneAndUpdate(
      { firebaseUid: selfSocket.data.firebaseUid },
      { isInCall: true, currentRoomId: roomId, lastActive: new Date() }
    ).catch(err => console.error('Failed to update call status:', err));
  }
  if (partnerSocket.data.firebaseUid) {
    User.findOneAndUpdate(
      { firebaseUid: partnerSocket.data.firebaseUid },
      { isInCall: true, currentRoomId: roomId, lastActive: new Date() }
    ).catch(err => console.error('Failed to update call status:', err));
  }

  selfSocket.data.currentRoomId = roomId;
  partnerSocket.data.currentRoomId = roomId;

  const selfQuality = selfSocket.data.videoQuality || appConfig.videoQuality.default;
  const partnerQuality = partnerSocket.data.videoQuality || appConfig.videoQuality.default;
  
  const qualityOrder = ['low', 'medium', 'high', 'hd'];
  const roomQuality = qualityOrder[Math.min(qualityOrder.indexOf(selfQuality), qualityOrder.indexOf(partnerQuality))];

  const roomData = {
    roomId,
    videoQuality: {
      current: roomQuality,
      settings: VIDEO_QUALITY[roomQuality],
      available: Object.keys(VIDEO_QUALITY).map(key => ({
        id: key,
        label: VIDEO_QUALITY[key].label,
        description: VIDEO_QUALITY[key].description
      })),
      switchMode: selfSocket.data.qualitySwitchMode || 'hybrid',
      adaptiveBitrate: appConfig.videoQuality.adaptiveBitrate,
      networkThresholds: appConfig.videoQuality.networkThresholds
    },
    iceServers: ICE_SERVERS,
    autoMatched: true
  };

  selfSocket.emit('room-joined', { ...roomData, peers: [{ socketId: partnerSocket.id, ...partnerData }] });
  partnerSocket.emit('room-joined', { ...roomData, peers: [{ socketId: selfSocket.id, ...selfData }] });

  console.log(`🤝 Room: ${roomId} (Quality: ${roomQuality})`);
}

async function endCall(roomId, endedBySocketId) {
  const activeCall = activeCalls.get(roomId);
  if (!activeCall) return;

  const endTime = Date.now();
  const duration = Math.floor((endTime - activeCall.startTime) / 1000);

  try {
    await CallHistory.create({
      roomId,
      callerFirebaseUid: activeCall.callerUid,
      receiverFirebaseUid: activeCall.receiverUid,
      startTime: new Date(activeCall.startTime),
      endTime: new Date(endTime),
      duration,
      endedBy: endedBySocketId,
      callQuality: 'medium'
    });
  } catch (err) {
    console.error('Failed to save call history:', err);
  }

  for (const uid of [activeCall.callerUid, activeCall.receiverUid]) {
    if (uid) {
      User.findOneAndUpdate(
        { firebaseUid: uid },
        { 
          $inc: { totalCalls: 1, totalCallDuration: duration },
          isInCall: false,
          currentRoomId: null,
          lastActive: new Date()
        }
      ).catch(err => console.error('Failed to update call stats:', err));
    }
  }

  activeCalls.delete(roomId);
}

function attemptMatch(newSocketId) {
  const socket = io.sockets.sockets.get(newSocketId);
  if (!socket) return;

  if (socket.data.currentRoomId) {
    socket.emit('error', { message: 'You are already in a call' });
    return;
  }

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
    if (candidateSocket && !candidateSocket.data.currentRoomId) {
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
  if (!partnerSocket || partnerSocket.data.currentRoomId) {
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

// Middleware
const verifyApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'API key required' });
  if (key !== API_KEY) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

// Database initialization
async function initDB() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('✅ MongoDB connected');

  let cfg = await AppConfigModel.findById('main').lean();
  if (!cfg) {
    cfg = {
      _id: 'main',
      videoQuality: {
        default: 'medium',
        autoAdjust: true,
        maxBitrate: 1500000,
        allowedQualities: ['low', 'medium', 'high', 'hd'],
        adaptiveBitrate: true,
        networkThresholds: {
          excellent: 5000,
          good: 2000,
          fair: 800,
          poor: 300
        }
      },
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

// ==================== ROUTES ====================

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  activeConnections: 0,
  activeCalls: activeCalls.size,
  queueLength: randomQueue.length,
  serviceName: SERVICE_NAME,
  firebaseConfigured: !!firebaseApp,
  videoQualitySupported: Object.keys(VIDEO_QUALITY),
}));

// ==================== GOOGLE OAUTH ENDPOINTS ====================

// Mobile-friendly endpoint - returns auth URL as JSON
app.get('/auth/google/mobile', verifyApiKey, async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google OAuth not configured.' });
  }

  const redirect = req.query.redirect || 'oreyapp://auth';
  const state = Buffer.from(JSON.stringify({ redirect })).toString('base64');

  const authUrl = googleOAuth2Client.generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'profile', 'email'],
    state,
    display: 'touch',
    response_type: 'code',
  });

  return res.json({ 
    authUrl, 
    redirectUri: GOOGLE_REDIRECT_URI,
    message: 'Open this URL in a browser' 
  });
});

// Web redirect endpoint
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google OAuth not configured.');
  }

  const state = req.query.redirect
    ? Buffer.from(JSON.stringify({ redirect: req.query.redirect })).toString('base64')
    : undefined;

  const authUrl = googleOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['openid', 'profile', 'email'],
    ...(state ? { state } : {}),
  });

  res.redirect(authUrl);
});

// OAuth callback handler - UPDATED with direct 302 redirect (no HTML page)
app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  // User denied access
  if (error) {
    console.warn('Google OAuth denied:', error);
    
    let errorRedirect = process.env.GOOGLE_FAILURE_REDIRECT || null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (decoded.redirect) errorRedirect = decoded.redirect;
      } catch (_) {}
    }

    if (errorRedirect) {
      const sep = errorRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${errorRedirect}${sep}error=${encodeURIComponent(error)}`);
    }
    return res.status(400).json({ success: false, error: 'Google sign-in was cancelled or denied.' });
  }

  if (!code) {
    return res.status(400).json({ success: false, error: 'Missing authorization code.' });
  }

  try {
    // Exchange code for tokens
    const { tokens } = await googleOAuth2Client.getToken(code);
    googleOAuth2Client.setCredentials(tokens);

    const ticket = await googleOAuth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const { sub: googleId, email, name, picture } = payload;
    const uid = `google_${googleId}`;

    const { user, conflict } = await upsertUserFromGoogle({ uid, email, name, picture });

    if (conflict) {
      let errorRedirect = process.env.GOOGLE_FAILURE_REDIRECT || null;
      if (state) {
        try {
          const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
          if (decoded.redirect) errorRedirect = decoded.redirect;
        } catch (_) {}
      }
      if (errorRedirect) {
        const sep = errorRedirect.includes('?') ? '&' : '?';
        return res.redirect(`${errorRedirect}${sep}error=email_conflict&email=${encodeURIComponent(email)}`);
      }
      return res.status(409).json({ success: false, error: 'Email already registered with a different account.' });
    }

    console.log(`✅ OAuth callback: ${email} (${uid})`);

    let postLoginRedirect = process.env.GOOGLE_SUCCESS_REDIRECT || null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (decoded.redirect) postLoginRedirect = decoded.redirect;
      } catch (_) {}
    }

    // Check if this is a mobile request
    const isMobile = req.query.mobile === 'true' || (postLoginRedirect && postLoginRedirect.startsWith('oreyapp://'));
    
    // ✅ DIRECT 302 REDIRECT (no HTML page)
    if (isMobile && postLoginRedirect) {
      const separator = postLoginRedirect.includes('?') ? '&' : '?';
      const redirectUrl = `${postLoginRedirect}${separator}uid=${encodeURIComponent(uid)}&oreyId=${encodeURIComponent(user.oreyId || '')}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.displayName || '')}`;
      console.log('📱 Mobile redirect to:', redirectUrl);
      return res.redirect(redirectUrl);
    }

    const responsePayload = {
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        oreyId: user.oreyId,
        ageVerified: user.ageVerified,
        gender: user.gender,
        termsAccepted: user.termsAccepted,
        totalCalls: user.totalCalls,
        createdAt: user.createdAt,
      },
      requiresAgeVerification: !user.ageVerified,
      requiresTermsAcceptance: !user.termsAccepted,
      isFullyVerified: user.termsAccepted && user.ageVerified,
    };

    if (postLoginRedirect && !postLoginRedirect.startsWith('oreyapp://')) {
      const separator = postLoginRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${postLoginRedirect}${separator}uid=${encodeURIComponent(uid)}&oreyId=${encodeURIComponent(user.oreyId || '')}`);
    }

    return res.json(responsePayload);

  } catch (err) {
    console.error('❌ OAuth callback error:', err.message);
    
    let errorRedirect = process.env.GOOGLE_FAILURE_REDIRECT || null;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        if (decoded.redirect) errorRedirect = decoded.redirect;
      } catch (_) {}
    }

    if (errorRedirect) {
      const sep = errorRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${errorRedirect}${sep}error=${encodeURIComponent('Authentication failed. Please try again.')}`);
    }
    return res.status(500).json({ success: false, error: 'Authentication failed. Please try again.' });
  }
});

// ==================== API ENDPOINTS ====================

app.post('/api/user/create', verifyApiKey, async (req, res) => {
  const { uid, email, displayName } = req.body;
  
  if (!uid || !email) {
    return res.status(400).json({ error: 'uid and email required' });
  }
  
  try {
    const { user, conflict } = await upsertUserFromGoogle({ 
      uid, 
      email, 
      name: displayName || email.split('@')[0],
      picture: null 
    });
    
    if (conflict) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/google', verifyApiKey, async (req, res) => {
  if (!firebaseApp) {
    return res.status(503).json({ error: 'Authentication service not configured' });
  }
  
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID token required' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;
    
    const { user, conflict } = await upsertUserFromGoogle({ uid, email, name, picture });
    if (conflict) return res.status(409).json({ error: 'Email already registered' });
    
    res.json({
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        oreyId: user.oreyId,
        ageVerified: user.ageVerified,
        gender: user.gender,
        genderVerified: user.genderVerified,
        termsAccepted: user.termsAccepted,
        videoQualityPreference: user.videoQualityPreference,
        qualitySwitchMode: user.qualitySwitchMode,
        totalCalls: user.totalCalls,
        createdAt: user.createdAt
      },
      requiresAgeVerification: !user.ageVerified,
      requiresTermsAcceptance: !user.termsAccepted,
      isFullyVerified: user.termsAccepted && user.ageVerified
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

app.post('/api/auth/google-access-token', verifyApiKey, async (req, res) => {
  if (!firebaseApp) {
    return res.status(503).json({ error: 'Authentication service not configured' });
  }

  const { accessToken, profile } = req.body;
  
  if (!accessToken || !profile) {
    return res.status(400).json({ error: 'accessToken and profile required' });
  }

  try {
    const googleRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${accessToken}`);
    const googleUser = await googleRes.json();

    if (!googleUser.email) {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    const { sub: googleId, email, name, picture } = googleUser;
    const uid = `google_${googleId}`;
    
    const { user, conflict } = await upsertUserFromGoogle({ uid, email, name, picture });
    if (conflict) return res.status(409).json({ error: 'Email already registered' });

    res.json({
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        oreyId: user.oreyId,
        ageVerified: user.ageVerified,
        gender: user.gender,
        termsAccepted: user.termsAccepted,
        totalCalls: user.totalCalls,
        createdAt: user.createdAt
      },
      requiresAgeVerification: !user.ageVerified,
      requiresTermsAcceptance: !user.termsAccepted,
      isFullyVerified: user.termsAccepted && user.ageVerified
    });
  } catch (error) {
    console.error('Access token auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

app.get('/api/user/profile', verifyApiKey, async (req, res) => {
  const { firebaseUid } = req.query;
  if (!firebaseUid) {
    return res.status(400).json({ error: 'firebaseUid required' });
  }
  
  const user = await User.findOne({ firebaseUid }).select('-__v');
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({ user });
});

app.post('/api/user/verify-age', verifyApiKey, async (req, res) => {
  const { firebaseUid, birthDate } = req.body;
  if (!firebaseUid || !birthDate) {
    return res.status(400).json({ error: 'firebaseUid and birthDate required' });
  }
  
  const user = await User.findOne({ firebaseUid });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  
  if (age < 18) {
    return res.status(403).json({ 
      error: 'Must be 18 or older to use this service',
      ageVerified: false,
      age: age
    });
  }
  
  user.birthDate = birth;
  user.ageVerified = true;
  user.lastActive = new Date();
  await user.save();
  
  res.json({ 
    success: true, 
    ageVerified: true,
    age: age,
    isFullyVerified: user.termsAccepted && user.ageVerified
  });
});

app.post('/api/accept-terms', verifyApiKey, async (req, res) => {
  const { deviceId, firebaseUid, termsVersion } = req.body;
  if (!deviceId && !firebaseUid) {
    return res.status(400).json({ error: 'deviceId or firebaseUid required' });
  }
  
  if (firebaseUid) {
    const user = await User.findOneAndUpdate(
      { firebaseUid },
      { 
        termsAccepted: true, 
        termsVersion: termsVersion || appConfig.termsVersion,
        deviceId: deviceId || undefined,
        lastActive: new Date()
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      message: 'Terms accepted',
      isFullyVerified: user.ageVerified
    });
  } else {
    res.json({ success: true, message: 'Terms accepted (device only)' });
  }
});

app.post('/api/device/register', verifyApiKey, async (req, res) => {
  const { deviceId, firebaseUid, platform } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  
  const ban = await isDeviceBanned(deviceId, firebaseUid);
  if (ban) {
    return res.status(403).json({
      error: 'Device or account banned',
      banned: true,
      reason: ban.reason,
      canAppeal: ban.canAppeal,
      expiresAt: ban.expiresAt || null
    });
  }
  
  if (firebaseUid) {
    await User.findOneAndUpdate(
      { firebaseUid },
      { deviceId, lastActive: new Date() }
    );
  }
  
  let termsAccepted = false;
  let ageVerified = false;
  let isFullyVerified = false;
  
  if (firebaseUid) {
    const user = await User.findOne({ firebaseUid });
    termsAccepted = user?.termsAccepted || false;
    ageVerified = user?.ageVerified || false;
    isFullyVerified = termsAccepted && ageVerified;
  }
  
  console.log('📱 Device registered:', deviceId.substring(0, 12) + '...');
  res.json({
    success: true,
    deviceId,
    registered: true,
    termsAccepted,
    ageVerified,
    isFullyVerified,
    termsVersion: appConfig.termsVersion,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    features: {
      videoCall: true,
      chat: true,
      reporting: true,
      safetyFeatures: true,
      genderMatching: true,
      videoQualityControl: true,
      adaptiveBitrate: appConfig.videoQuality.adaptiveBitrate,
      googleAuth: !!firebaseApp,
      callHistory: true,
    },
    videoQuality: {
      ...appConfig.videoQuality,
      options: Object.keys(VIDEO_QUALITY).map(key => ({
        id: key,
        ...VIDEO_QUALITY[key]
      })),
      modes: QUALITY_SWITCH_MODES
    },
    iceServers: ICE_SERVERS,
    safety: appConfig.safety,
    reportReasons: REPORT_REASONS,
    termsVersion: appConfig.termsVersion,
    serviceName: SERVICE_NAME
  });
});

app.get('/api/version', (req, res) => {
  res.json({
    currentVersion: '2.0.0',
    updateAvailable: false,
    message: 'You are using the latest version',
    features: ['google-auth', 'google-oauth-redirect', 'video-quality-switching', 'adaptive-bitrate', 'call-history', 'verification-gates']
  });
});

// ==================== SOCKET.IO ====================

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7,
  pingTimeout: 60000,
  pingInterval: 25000
});

const genderMatcher = createGenderMatcher(io);

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} (Total: ${io.engine.clientsCount})`);
  
  const networkQuality = estimateNetworkQuality(socket);
  
  socket.emit('config', {
    videoQuality: {
      ...appConfig.videoQuality,
      currentNetwork: networkQuality,
      recommendedQuality: getAdaptiveQuality(networkQuality, 'medium'),
      options: Object.keys(VIDEO_QUALITY).map(key => ({
        id: key,
        ...VIDEO_QUALITY[key]
      }))
    },
    iceServers: ICE_SERVERS,
    serviceName: SERVICE_NAME
  });

  socket.on('register-device', async ({ deviceId, firebaseUid, videoQuality, qualitySwitchMode }) => {
    if (!deviceId) {
      socket.emit('error', { message: 'Device ID required' });
      return;
    }
    
    const ban = await isDeviceBanned(deviceId, firebaseUid);
    if (ban) {
      socket.emit('banned', {
        reason: ban.reason,
        canAppeal: ban.canAppeal,
        message: 'Your device or account has been banned. You may appeal through the app.'
      });
      socket.disconnect(true);
      return;
    }
    
    socket.data.deviceId = deviceId;
    socket.data.firebaseUid = firebaseUid;
    socket.data.videoQuality = videoQuality || 'medium';
    socket.data.qualitySwitchMode = qualitySwitchMode || 'hybrid';
    
    if (firebaseUid) {
      const user = await User.findOne({ firebaseUid });
      if (user) {
        socket.data.userName = user.displayName;
        socket.data.oreyId = user.oreyId;
        socket.data.gender = user.gender;
        socket.data.videoQuality = user.videoQualityPreference;
        socket.data.qualitySwitchMode = user.qualitySwitchMode;
        socket.data.isFullyVerified = user.termsAccepted && user.ageVerified;
        
        await User.findOneAndUpdate(
          { firebaseUid },
          { lastActive: new Date() }
        );
      }
    }
    
    socket.emit('registered', { 
      deviceId,
      videoQuality: socket.data.videoQuality,
      qualitySwitchMode: socket.data.qualitySwitchMode,
      isFullyVerified: socket.data.isFullyVerified || false
    });
  });

  socket.on('register-orey-id', ({ oreyId, userName, firebaseUid }) => {
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
    entry.firebaseUid = firebaseUid || entry.firebaseUid;
    socket.data.oreyId = oreyId;
    socket.data.userName = userName || 'Anonymous';
    socket.data.firebaseUid = firebaseUid || socket.data.firebaseUid;
    socket.emit('orey-id-registered', { oreyId, expiresAt: entry.expiresAt });
  });

  socket.on('join-random', async () => {
    if (socket.data.firebaseUid) {
      const user = await User.findOne({ firebaseUid: socket.data.firebaseUid });
      if (!user) {
        socket.emit('error', { message: 'User account not found' });
        return;
      }
      if (!user.termsAccepted) {
        socket.emit('verification-required', { 
          type: 'terms',
          message: 'You must accept Terms & Conditions to start matching' 
        });
        return;
      }
      if (!user.ageVerified) {
        socket.emit('verification-required', { 
          type: 'age',
          message: 'Age verification required before matching' 
        });
        return;
      }
      if (user.isInCall) {
        socket.emit('error', { message: 'You are already in a call' });
        return;
      }
    }
    
    removeFromQueue(socket.id);
    randomQueue.push(socket.id);
    socket.emit('waiting');
    attemptMatch(socket.id);
  });

  socket.on('cancel-random', () => {
    removeFromQueue(socket.id);
    socket.emit('cancelled');
  });

  socket.on('skip', async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      await endCall(roomId, socket.id);
      
      [...room.keys()].forEach(pid => {
        if (pid !== socket.id) {
          const ps = io.sockets.sockets.get(pid);
          if (ps) {
            ps.emit('partner-left', { reason: 'skip' });
            ps.data.currentRoomId = null;
          }
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
      
      socket.data.currentRoomId = null;
    }
    socket.emit('skipped');
    randomQueue.push(socket.id);
    attemptMatch(socket.id);
  });

  socket.on('leave-chat', async ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      await endCall(roomId, socket.id);
      
      [...room.keys()].forEach(pid => {
        if (pid !== socket.id) {
          const ps = io.sockets.sockets.get(pid);
          if (ps) {
            ps.emit('partner-left', { reason: 'left' });
            ps.data.currentRoomId = null;
          }
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
      
      socket.data.currentRoomId = null;
    }
    socket.emit('left');
  });

  socket.on('offer', ({ targetId, offer }) => {
    io.to(targetId).emit('offer', { offer, fromId: socket.id });
  });
  
  socket.on('answer', ({ targetId, answer }) => {
    io.to(targetId).emit('answer', { answer, fromId: socket.id });
  });
  
  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  socket.on('disconnect', async () => {
    console.log(`[-] ${socket.id}`);
    removeFromQueue(socket.id);
    
    if (socket.data.oreyId) {
      const entry = oreyIds.get(socket.data.oreyId);
      if (entry && entry.socketId === socket.id) entry.socketId = null;
    }
    
    if (socket.data.currentRoomId) {
      await endCall(socket.data.currentRoomId, socket.id);
    }
    
    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const ps = io.sockets.sockets.get(pid);
        if (ps) {
          ps.emit('partner-left', { reason: 'disconnected' });
          ps.data.currentRoomId = null;
        }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
    
    if (socket.data.firebaseUid) {
      User.findOneAndUpdate(
        { firebaseUid: socket.data.firebaseUid },
        { isInCall: false, currentRoomId: null, lastActive: new Date() }
      ).catch(err => console.error('Failed to update user status on disconnect:', err));
    }
  });
});

// Cleanup interval
setInterval(cleanExpiredOreyIds, 10 * 60 * 1000);

// Start server
async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 ${SERVICE_NAME} running on port ${PORT}`);
      console.log(`✅ Firebase: ${firebaseApp ? 'Configured' : 'Not configured'}`);
      console.log(`✅ Google OAuth redirect: GET /auth/google → /auth/google/callback`);
      console.log(`✅ Google OAuth mobile: GET /auth/google/mobile (for Snack/Expo)`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
}

start();
