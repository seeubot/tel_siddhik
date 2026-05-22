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

// ✅ Firebase Admin Initialization from Environment Variables
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
    console.log('✅ Firebase Admin initialized from environment variables');
  } else {
    console.log('⚠️ Firebase environment variables not set - auth endpoints will not work');
    console.log('Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
}

// ✅ Video quality with dynamic switching
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
  'Other'
];

// ✅ MongoDB Schemas
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
  createdAt: { type: Date, default: Date.now },
  lastLogin: Date,
  isActive: { type: Boolean, default: true }
});
const User = mongoose.model('User', UserSchema);

const ReportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  reporterDeviceId: String,
  reporterFirebaseUid: String,
  reportedDeviceId: { type: String, index: true },
  reportedFirebaseUid: { type: String, index: true },
  reportedUserId: String,
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

// ✅ Helper Functions
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
  const thresholds = appConfig.videoQuality.networkThresholds;
  
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
    $or: [
      { firebaseUid },
      { deviceId }
    ],
    issuedAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  return { warningIssued: true, warningCount: recentWarnings };
}

async function banDevice(deviceId, firebaseUid, banInfo) {
  const ban = new Ban({
    ...banInfo,
    deviceId,
    firebaseUid
  });
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
  const query = firebaseUid 
    ? { $or: [{ firebaseUid }, { deviceId }] }
    : { deviceId };
    
  const ban = await Ban.findOne(query);
  if (!ban) return null;
  
  if (ban.expiresAt && Date.now() > new Date(ban.expiresAt).getTime()) {
    await Ban.deleteOne({ _id: ban._id });
    return null;
  }
  return ban;
}

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

  rooms.get(roomId).set(selfSocket.id, selfData);
  rooms.get(roomId).set(partnerSocket.id, partnerData);

  const selfQuality = selfSocket.data.videoQuality || appConfig.videoQuality.default;
  const partnerQuality = partnerSocket.data.videoQuality || appConfig.videoQuality.default;
  
  const qualityOrder = ['low', 'medium', 'high', 'hd'];
  const roomQuality = qualityOrder[
    Math.min(
      qualityOrder.indexOf(selfQuality),
      qualityOrder.indexOf(partnerQuality)
    )
  ];

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

// ==================== ROUTES ====================

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date().toISOString(),
  uptime: process.uptime(),
  activeConnections: io?.engine?.clientsCount || 0,
  serviceName: SERVICE_NAME,
  firebaseConfigured: !!firebaseApp,
  videoQualitySupported: Object.keys(VIDEO_QUALITY),
}));

// ✅ Google Authentication
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
    
    let user = await User.findOne({ firebaseUid: uid });
    
    if (!user) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      
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
        videoQualityPreference: 'medium',
        qualitySwitchMode: 'hybrid'
      });
      
      const hashId = crypto.createHash('sha256').update(displayId + uid).digest('hex').substring(0, 16);
      const expiresAt = Date.now() + OREY_ID_TTL_MS;
      
      oreyIds.set(displayId, {
        hashId,
        displayId,
        expiresAt,
        socketId: null,
        userName: user.displayName,
        firebaseUid: uid
      });
      
      await OreyIdModel.create({
        hashId,
        displayId,
        socketId: null,
        userName: user.displayName,
        expiresAt: new Date(expiresAt),
        firebaseUid: uid
      }).catch(err => console.error('OreyId creation error:', err));
    } else {
      user.lastLogin = new Date();
    }
    
    await user.save();
    
    res.json({
      success: true,
      user: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        oreyId: user.oreyId,
        ageVerified: user.ageVerified,
        gender: user.gender,
        genderVerified: user.genderVerified,
        termsAccepted: user.termsAccepted,
        videoQualityPreference: user.videoQualityPreference,
        qualitySwitchMode: user.qualitySwitchMode,
        createdAt: user.createdAt
      },
      requiresAgeVerification: !user.ageVerified,
      requiresTermsAcceptance: !user.termsAccepted
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// ✅ Verify user age
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
      error: 'Must be 18 or older',
      ageVerified: false 
    });
  }
  
  user.birthDate = birth;
  user.ageVerified = true;
  await user.save();
  
  res.json({ 
    success: true, 
    ageVerified: true,
    age: age 
  });
});

// ✅ Set gender
app.post('/api/user/set-gender', verifyApiKey, async (req, res) => {
  const { firebaseUid, gender } = req.body;
  if (!firebaseUid || !gender) {
    return res.status(400).json({ error: 'firebaseUid and gender required' });
  }
  
  if (!['male', 'female', 'other', 'prefer_not_to_say'].includes(gender)) {
    return res.status(400).json({ error: 'Invalid gender option' });
  }
  
  const user = await User.findOne({ firebaseUid });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.gender = gender;
  user.genderVerified = true;
  await user.save();
  
  res.json({ 
    success: true, 
    gender: user.gender,
    genderVerified: true 
  });
});

// ✅ Accept Terms
app.post('/api/accept-terms', verifyApiKey, async (req, res) => {
  const { deviceId, firebaseUid, termsVersion } = req.body;
  if (!deviceId && !firebaseUid) {
    return res.status(400).json({ error: 'deviceId or firebaseUid required' });
  }
  
  if (firebaseUid) {
    const user = await User.findOne({ firebaseUid });
    if (user) {
      user.termsAccepted = true;
      user.termsVersion = termsVersion || appConfig.termsVersion;
      if (deviceId) user.deviceId = deviceId;
      await user.save();
    }
  }
  
  res.json({ success: true, message: 'Terms accepted' });
});

// ✅ Device registration
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
    const user = await User.findOne({ firebaseUid });
    if (user) {
      user.deviceId = deviceId;
      await user.save();
    }
  }
  
  let termsAccepted = false;
  if (firebaseUid) {
    const user = await User.findOne({ firebaseUid });
    termsAccepted = user?.termsAccepted || false;
  }
  
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

// ✅ Check ban
app.post('/api/device/check-ban', verifyApiKey, async (req, res) => {
  const { deviceId, firebaseUid } = req.body;
  if (!deviceId && !firebaseUid) {
    return res.status(400).json({ error: 'deviceId or firebaseUid required' });
  }
  
  const ban = await isDeviceBanned(deviceId, firebaseUid);
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

// ✅ Appeal
app.post('/api/appeal-ban', verifyApiKey, async (req, res) => {
  const { deviceId, firebaseUid, reason } = req.body;
  if ((!deviceId && !firebaseUid) || !reason) {
    return res.status(400).json({ error: 'deviceId/firebaseUid and reason required' });
  }
  
  const result = await handleAppeal(deviceId, firebaseUid, reason);
  res.json(result);
});

// ✅ Report
app.post('/api/report', verifyApiKey, async (req, res) => {
  const { reporterDeviceId, reporterFirebaseUid, reportedDeviceId, reportedFirebaseUid, reason, description } = req.body;
  
  if ((!reportedDeviceId && !reportedFirebaseUid) || !reason) {
    return res.status(400).json({ error: 'reportedDeviceId/reportedFirebaseUid and reason required' });
  }
  if (!REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Invalid report reason' });
  }
  
  const query = {
    reason,
    timestamp: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  };
  if (reporterFirebaseUid) {
    query.reporterFirebaseUid = reporterFirebaseUid;
  } else {
    query.reporterDeviceId = reporterDeviceId;
  }
  
  const existingReport = await Report.findOne(query);
  if (existingReport) {
    return res.status(400).json({ error: 'Already reported within 24 hours' });
  }
  
  const reportId = uuidv4().substring(0, 8);
  await Report.create({
    id: reportId,
    reporterDeviceId,
    reporterFirebaseUid,
    reportedDeviceId,
    reportedFirebaseUid,
    reason,
    description: description || '',
    timestamp: new Date(),
    status: 'pending'
  });
  
  const reportQuery = reportedFirebaseUid 
    ? { $or: [{ reportedFirebaseUid }, { reportedDeviceId }] }
    : { reportedDeviceId };
    
  const reportCount = await Report.countDocuments({
    ...reportQuery,
    timestamp: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });
  
  let warningIssued = false;
  let warningCount = 0;
  
  if (reportCount >= 3 && reportCount < 5) {
    const warning = await issueWarning(
      reportedDeviceId, 
      reportedFirebaseUid, 
      `Multiple reports (${reportCount}) received`
    );
    warningIssued = warning.warningIssued;
    warningCount = warning.warningCount;
  } else if (reportCount >= 5) {
    console.log(`⚠️ User has ${reportCount} reports, needs review`);
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

// ✅ User profile
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

// ✅ Video quality preference
app.post('/api/user/video-quality', verifyApiKey, async (req, res) => {
  const { firebaseUid, quality, switchMode } = req.body;
  if (!firebaseUid) {
    return res.status(400).json({ error: 'firebaseUid required' });
  }
  
  const user = await User.findOne({ firebaseUid });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (quality && !['low', 'medium', 'high', 'hd'].includes(quality)) {
    return res.status(400).json({ error: 'Invalid quality option' });
  }
  
  if (switchMode && !['manual', 'auto', 'hybrid'].includes(switchMode)) {
    return res.status(400).json({ error: 'Invalid switch mode' });
  }
  
  if (quality) user.videoQualityPreference = quality;
  if (switchMode) user.qualitySwitchMode = switchMode;
  
  await user.save();
  
  res.json({ 
    success: true,
    videoQualityPreference: user.videoQualityPreference,
    qualitySwitchMode: user.qualitySwitchMode
  });
});

// ✅ App config
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

// ✅ Generate Orey ID
app.get('/generate-orey-id', verifyApiKey, async (req, res) => {
  const { firebaseUid } = req.query;
  
  cleanExpiredOreyIds();
  
  if (firebaseUid) {
    const existingUser = await User.findOne({ firebaseUid });
    if (existingUser?.oreyId) {
      return res.json({ 
        oreyId: existingUser.oreyId, 
        expiresAt: Date.now() + OREY_ID_TTL_MS,
        validDuration: '24 hours',
        existing: true
      });
    }
  }
  
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
    userName: '',
    firebaseUid: firebaseUid || null
  });
  
  OreyIdModel.create({
    hashId,
    displayId,
    socketId: null,
    userName: '',
    expiresAt: new Date(expiresAt),
    firebaseUid: firebaseUid || null
  }).catch(() => { });
  
  res.json({ 
    oreyId: displayId, 
    expiresAt, 
    validDuration: '24 hours',
    firebaseUid: firebaseUid || null
  });
});

// ✅ Version
app.get('/api/version', (req, res) => {
  res.json({
    currentVersion: '2.0.0',
    updateAvailable: false,
    message: 'You are using the latest version with video quality control',
    features: ['google-auth', 'video-quality-switching', 'adaptive-bitrate']
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

  // Register device
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
      }
    }
    
    socket.emit('registered', { 
      deviceId,
      videoQuality: socket.data.videoQuality,
      qualitySwitchMode: socket.data.qualitySwitchMode
    });
  });

  // Register Orey ID
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

  // Change video quality during call
  socket.on('change-video-quality', ({ roomId, quality }) => {
    if (!roomId || !quality) return;
    if (!['low', 'medium', 'high', 'hd'].includes(quality)) return;
    
    const room = rooms.get(roomId);
    if (!room || !room.has(socket.id)) return;
    
    socket.data.videoQuality = quality;
    
    socket.to(roomId).emit('video-quality-changed', {
      quality,
      settings: VIDEO_QUALITY[quality],
      fromId: socket.id
    });
    
    if (socket.data.firebaseUid) {
      User.findOneAndUpdate(
        { firebaseUid: socket.data.firebaseUid },
        { videoQualityPreference: quality }
      ).catch(err => console.error('Failed to update quality preference:', err));
    }
    
    console.log(`🎥 Quality changed to ${quality} in room ${roomId}`);
  });

  // Check network quality
  socket.on('check-network-quality', () => {
    const networkQuality = estimateNetworkQuality(socket);
    const recommendedQuality = getAdaptiveQuality(
      networkQuality, 
      socket.data.videoQuality || 'medium'
    );
    
    socket.emit('network-quality-update', {
      networkQuality,
      recommendedQuality,
      currentQuality: socket.data.videoQuality || 'medium',
      settings: VIDEO_QUALITY[recommendedQuality]
    });
  });

  // Auto-adjust quality
  socket.on('enable-auto-quality', ({ enabled, roomId }) => {
    socket.data.qualitySwitchMode = enabled ? 'auto' : 'manual';
    
    if (roomId) {
      socket.to(roomId).emit('quality-mode-changed', {
        mode: socket.data.qualitySwitchMode,
        fromId: socket.id
      });
    }
    
    if (socket.data.firebaseUid) {
      User.findOneAndUpdate(
        { firebaseUid: socket.data.firebaseUid },
        { qualitySwitchMode: socket.data.qualitySwitchMode }
      ).catch(err => console.error('Failed to update quality mode:', err));
    }
  });

  // Join random
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

  // Chat message
  socket.on('chat-message', ({ roomId, message }) => {
    if (!roomId || !message || message.length > 500) return;
    
    const room = rooms.get(roomId);
    if (!room || !room.has(socket.id)) return;
    
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

// Cleanup
setInterval(cleanExpiredOreyIds, 10 * 60 * 1000);

// Start server
async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 ${SERVICE_NAME} running on port ${PORT}`);
      console.log(`✅ Google Play Store compliant`);
      console.log(`✅ Video quality switching enabled`);
      console.log(`✅ Firebase Auth: ${firebaseApp ? 'Configured' : 'Not configured'}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });
  } catch (err) {
    console.error('❌ Startup failed:', err.message);
    process.exit(1);
  }
}

start();
