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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://naya:naya@naya.fk9em5f.mongodb.net/?appName=naya';
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS = 5000;
const API_KEY = process.env.API_KEY || 'maya@1660440';
const ADMIN_KEY = process.env.ADMIN_KEY || 'maya@1660440';
const SERVICE_NAME = 'Orey! - Connect Safely';

// Google OAuth2 Client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/auth/google/callback';

const googleOAuth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Firebase Admin Initialization
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
    console.log('Firebase Admin initialized');
  } else {
    console.log('Firebase not configured');
  }
} catch (error) {
  console.error('Firebase Admin initialization failed:', error.message);
}

// Video quality configuration
const VIDEO_QUALITY = {
  low: { maxBitrate: 150000, scaleResolutionDownBy: 4, maxFramerate: 15, label: 'Low (Data Saver)', description: '240p, optimized for slow connections' },
  medium: { maxBitrate: 500000, scaleResolutionDownBy: 2, maxFramerate: 24, label: 'Medium', description: '480p, balanced quality' },
  high: { maxBitrate: 1500000, scaleResolutionDownBy: 1, maxFramerate: 30, label: 'High', description: '720p, recommended for WiFi' },
  hd: { maxBitrate: 4000000, scaleResolutionDownBy: 1, maxFramerate: 30, label: 'HD', description: '1080p, requires strong connection' },
};

const QUALITY_SWITCH_MODES = { manual: 'User manually selects quality', auto: 'Server adjusts based on network conditions', hybrid: 'User sets max, server can lower if needed' };

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }, { urls: 'stun:stun3.l.google.com:19302' }, { urls: 'stun:stun4.l.google.com:19302' },
];

const REPORT_REASONS = ['Harassment or Bullying', 'Hate Speech', 'Spam or Scam', 'Fake Profile', 'Impersonation', 'Privacy Violation', 'Inappropriate Content', 'Other'];
const INTEREST_TAGS = ['Movies', 'Music', 'Cooking', 'Travel', 'Sports', 'Technology'];

// ==================== MONGODB SCHEMAS ====================

const BanSchema = new mongoose.Schema({
  deviceId: { type: String, index: true }, firebaseUid: { type: String, index: true },
  reason: String, timestamp: { type: Date, default: Date.now }, expiresAt: { type: Date, default: null },
  durationHours: { type: Number, default: null }, permanent: { type: Boolean, default: false },
  source: { type: String, default: 'admin' }, canAppeal: { type: Boolean, default: true },
  appealStatus: { type: String, default: 'none' }, appealReason: String, appealResponse: String, appealReviewedAt: Date,
});
BanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); BanSchema.index({ firebaseUid: 1, deviceId: 1 });
const Ban = mongoose.model('Ban', BanSchema);

const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true }, email: { type: String, required: true, unique: true },
  displayName: String, photoURL: String, oreyId: { type: String, unique: true, sparse: true, index: true }, deviceId: String,
  ageVerified: { type: Boolean, default: false }, birthDate: Date,
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'], default: 'prefer_not_to_say' },
  genderVerified: { type: Boolean, default: false },
  genderPreference: { type: String, enum: ['male', 'female', 'both'], default: 'both' },
  interests: [{ type: String, enum: INTEREST_TAGS }],
  termsAccepted: { type: Boolean, default: false }, termsVersion: String,
  videoQualityPreference: { type: String, enum: ['low', 'medium', 'high', 'hd'], default: 'medium' },
  qualitySwitchMode: { type: String, enum: ['manual', 'auto', 'hybrid'], default: 'hybrid' },
  isInCall: { type: Boolean, default: false }, currentRoomId: { type: String, default: null },
  totalCalls: { type: Number, default: 0 }, totalCallDuration: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }, lastLogin: Date, lastActive: Date, isActive: { type: Boolean, default: true }
});
const User = mongoose.model('User', UserSchema);

const CallHistorySchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true }, callerFirebaseUid: String, receiverFirebaseUid: String,
  callerDeviceId: String, receiverDeviceId: String, startTime: { type: Date, default: Date.now }, endTime: Date,
  duration: { type: Number, default: 0 }, endedBy: String, callQuality: String, wasReported: { type: Boolean, default: false },
});
const CallHistory = mongoose.model('CallHistory', CallHistorySchema);

const ReportSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true }, reporterDeviceId: String, reporterFirebaseUid: String,
  reportedDeviceId: { type: String, index: true }, reportedFirebaseUid: { type: String, index: true }, reportedUserId: String,
  roomId: String, reason: String, description: String, timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'pending', index: true }, reviewedBy: String, reviewNotes: String, reviewedAt: Date,
  actionTaken: { type: String, default: 'none' }, warningIssued: { type: Boolean, default: false }, isSOS: { type: Boolean, default: false },
});
const Report = mongoose.model('Report', ReportSchema);

const WarningSchema = new mongoose.Schema({
  deviceId: { type: String, index: true }, firebaseUid: { type: String, index: true }, reason: String,
  issuedAt: { type: Date, default: Date.now }, expiresAt: { type: Date }, acknowledged: { type: Boolean, default: false }, acknowledgedAt: Date,
});
const Warning = mongoose.model('Warning', WarningSchema);

const NotificationSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, index: true }, title: String, message: String,
  type: { type: String, enum: ['call', 'reminder', 'feature', 'system', 'chat'], default: 'system' },
  read: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now },
});
const Notification = mongoose.model('Notification', NotificationSchema);

const ChatRoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true }, participants: [{ type: String }],
  messages: [{ senderUid: String, senderName: String, message: String, type: { type: String, enum: ['text', 'sticker', 'emoji', 'joke', 'dialogue'], default: 'text' }, stickerId: String, timestamp: { type: Date, default: Date.now } }],
  startedAt: { type: Date, default: Date.now }, endedAt: Date, isActive: { type: Boolean, default: true },
});
const ChatRoom = mongoose.model('ChatRoom', ChatRoomSchema);

const LeaderboardSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, index: true }, displayName: String, oreyId: String,
  weeklyScore: { type: Number, default: 0 }, monthlyScore: { type: Number, default: 0 }, allTimeScore: { type: Number, default: 0 },
  weeklyChats: { type: Number, default: 0 }, monthlyChats: { type: Number, default: 0 }, allTimeChats: { type: Number, default: 0 },
  weeklyGames: { type: Number, default: 0 }, badges: [{ type: String }], lastUpdated: { type: Date, default: Date.now },
});
const Leaderboard = mongoose.model('Leaderboard', LeaderboardSchema);

const GameScoreSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, index: true },
  gameType: { type: String, enum: ['movie', 'song', 'food'], required: true },
  score: { type: Number, default: 0 }, playedAt: { type: Date, default: Date.now },
});
GameScoreSchema.index({ firebaseUid: 1, gameType: 1 });
const GameScore = mongoose.model('GameScore', GameScoreSchema);

const GameQuestionSchema = new mongoose.Schema({
  gameType: { type: String, enum: ['movie', 'song', 'food'], required: true },
  question: String, clue: String, options: [{ type: String }], correctAnswer: String,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
});
const GameQuestion = mongoose.model('GameQuestion', GameQuestionSchema);

const AppConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  videoQuality: { default: { type: String, default: 'medium' }, autoAdjust: { type: Boolean, default: true }, maxBitrate: { type: Number, default: 1500000 }, allowedQualities: [{ type: String }], adaptiveBitrate: { type: Boolean, default: true }, networkThresholds: { excellent: { type: Number, default: 5000 }, good: { type: Number, default: 2000 }, fair: { type: Number, default: 800 }, poor: { type: Number, default: 300 } } },
  safety: Object, termsVersion: { type: String, default: '1.0.0' },
  latestAppVersion: { type: String, default: '1.0.0' }, minimumAppVersion: { type: String, default: '1.0.0' },
});
const AppConfigModel = mongoose.model('AppConfig', AppConfigSchema);

const OreyIdSchema = new mongoose.Schema({
  hashId: { type: String, required: true, unique: true, index: true }, displayId: { type: String, required: true, unique: true },
  socketId: { type: String, default: null }, firebaseUid: { type: String, index: true }, userName: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: true }, createdAt: { type: Date, default: Date.now },
});
OreyIdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const OreyIdModel = mongoose.model('OreyId', OreyIdSchema);

const oreyIds = new Map(); const rooms = new Map(); const randomQueue = []; const activeCalls = new Map(); const chatQueue = []; let appConfig = null;

// ==================== HELPERS ====================

function generateOreyDisplayId() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let suffix = ''; for (let i = 0; i < 5; i++) suffix += chars[Math.floor(Math.random() * chars.length)]; return 'OREY-' + suffix; }
function generateRoomId() { return uuidv4().replace(/-/g, '').substring(0, 8).toLowerCase(); }
function cleanExpiredOreyIds() { const now = Date.now(); for (const [id, data] of oreyIds.entries()) { if (data.expiresAt < now) oreyIds.delete(id); } }
function removeFromQueue(socketId) { const idx = randomQueue.indexOf(socketId); if (idx !== -1) randomQueue.splice(idx, 1); }
function removeSocketFromRooms(socketId) { for (const [roomId, peers] of rooms.entries()) { if (peers.has(socketId)) { peers.delete(socketId); if (peers.size === 0) rooms.delete(roomId); return { roomId, peers }; } } return null; }
function estimateNetworkQuality(socket) { const ping = socket.conn.transport.name === 'websocket' ? 30 : 100; if (socket.conn.transport.name === 'websocket' && ping < 50) return 'excellent'; if (ping < 100) return 'good'; if (ping < 200) return 'fair'; return 'poor'; }
function getAdaptiveQuality(networkQuality, userPreference) { const qualityMap = { 'excellent': 'hd', 'good': 'high', 'fair': 'medium', 'poor': 'low' }; return ['low', 'medium', 'high', 'hd'][Math.min(['low', 'medium', 'high', 'hd'].indexOf(qualityMap[networkQuality] || 'medium'), ['low', 'medium', 'high', 'hd'].indexOf(userPreference || 'medium'))]; }

async function createNotification(firebaseUid, title, message, type = 'system') {
  try {
    const notification = new Notification({ firebaseUid, title, message, type }); await notification.save();
    for (const [, socket] of io.sockets.sockets) { if (socket.data.firebaseUid === firebaseUid) { socket.emit('new-notification', { id: notification._id, title, message, type, createdAt: notification.createdAt }); } }
  } catch (err) { console.error('Failed to create notification:', err); }
}

async function issueWarning(deviceId, firebaseUid, reason) { const warning = new Warning({ deviceId, firebaseUid, reason, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }); await warning.save(); const recentWarnings = await Warning.countDocuments({ $or: [{ firebaseUid }, { deviceId }], issuedAt: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }); return { warningIssued: true, warningCount: recentWarnings }; }
async function banDevice(deviceId, firebaseUid, banInfo) { const ban = new Ban({ ...banInfo, deviceId, firebaseUid }); await ban.save(); for (const [, socket] of io.sockets.sockets) { if (socket.data.deviceId === deviceId || socket.data.firebaseUid === firebaseUid) { socket.emit('device-banned', { reason: banInfo.reason, canAppeal: true, appealUrl: '/appeal' }); socket.disconnect(true); } } return true; }
async function handleAppeal(deviceId, firebaseUid, appealReason) { const query = firebaseUid ? { firebaseUid } : { deviceId }; const ban = await Ban.findOne(query); if (!ban || !ban.canAppeal) return { success: false, message: 'No appeal available' }; ban.appealStatus = 'pending'; ban.appealReason = appealReason; await ban.save(); return { success: true, message: 'Appeal submitted. Review within 7 days.' }; }
async function isDeviceBanned(deviceId, firebaseUid) { const query = firebaseUid ? { $or: [{ firebaseUid }, { deviceId }] } : { deviceId }; const ban = await Ban.findOne(query); if (!ban) return null; if (ban.expiresAt && Date.now() > new Date(ban.expiresAt).getTime()) { await Ban.deleteOne({ _id: ban._id }); return null; } return ban; }
async function isUserVerified(firebaseUid) { if (!firebaseUid) return false; const user = await User.findOne({ firebaseUid }); if (!user) return false; return user.termsAccepted && user.ageVerified; }

async function updateLeaderboard(socket, type, points = 10) {
  if (!socket.data.firebaseUid) return;
  try {
    let entry = await Leaderboard.findOne({ firebaseUid: socket.data.firebaseUid });
    if (!entry) entry = new Leaderboard({ firebaseUid: socket.data.firebaseUid, displayName: socket.data.userName || 'Player', oreyId: socket.data.oreyId || 'OREY-XXXXX' });
    if (type === 'chat') { entry.weeklyChats += 1; entry.monthlyChats += 1; entry.allTimeChats += 1; }
    entry.weeklyScore += points; entry.monthlyScore += points; entry.allTimeScore += points; entry.lastUpdated = new Date();
    await entry.save();
  } catch (err) { console.error('Leaderboard update error:', err); }
}

async function upsertUserFromGoogle({ uid, email, name, picture }) {
  let user = await User.findOne({ firebaseUid: uid });
  if (!user) {
    const existingEmail = await User.findOne({ email }); if (existingEmail) return { user: null, conflict: true };
    let displayId, attempts = 0; do { displayId = generateOreyDisplayId(); attempts++; } while (await User.findOne({ oreyId: displayId }) && attempts < 20);
    user = new User({ firebaseUid: uid, email, displayName: name || email.split('@')[0], photoURL: picture || '', oreyId: displayId, lastLogin: new Date(), lastActive: new Date(), videoQualityPreference: 'medium', qualitySwitchMode: 'hybrid', gender: 'prefer_not_to_say', genderPreference: 'both', interests: [] });
    const hashId = crypto.createHash('sha256').update(displayId + uid).digest('hex').substring(0, 16); const expiresAt = Date.now() + OREY_ID_TTL_MS;
    oreyIds.set(displayId, { hashId, displayId, expiresAt, socketId: null, userName: user.displayName, firebaseUid: uid });
    await OreyIdModel.create({ hashId, displayId, socketId: null, userName: user.displayName, expiresAt: new Date(expiresAt), firebaseUid: uid }).catch(err => console.error('OreyId creation error:', err));
    await user.save();
    await createNotification(uid, 'Welcome to Orey!', 'Start connecting with people safely.', 'system');
  } else { user.lastLogin = new Date(); user.lastActive = new Date(); await user.save(); }
  return { user, conflict: false };
}

function _createRoom(selfSocket, partnerSocket) {
  const roomId = generateRoomId(); const startTime = Date.now();
  rooms.set(roomId, new Map()); selfSocket.join(roomId); partnerSocket.join(roomId);
  const selfData = { userName: selfSocket.data.userName || 'Anonymous', oreyId: selfSocket.data.oreyId || null, deviceId: selfSocket.data.deviceId || null, gender: selfSocket.data.gender || null, firebaseUid: selfSocket.data.firebaseUid || null, videoQuality: selfSocket.data.videoQuality || 'medium' };
  const partnerData = { userName: partnerSocket.data.userName || 'Anonymous', oreyId: partnerSocket.data.oreyId || null, deviceId: partnerSocket.data.deviceId || null, gender: partnerSocket.data.gender || null, firebaseUid: partnerSocket.data.firebaseUid || null, videoQuality: partnerSocket.data.videoQuality || 'medium' };
  rooms.get(roomId).set(selfSocket.id, { ...selfData, joinedAt: startTime }); rooms.get(roomId).set(partnerSocket.id, { ...partnerData, joinedAt: startTime });
  activeCalls.set(roomId, { roomId, startTime, participants: [selfSocket.id, partnerSocket.id], callerUid: selfSocket.data.firebaseUid, receiverUid: partnerSocket.data.firebaseUid });
  if (selfSocket.data.firebaseUid) User.findOneAndUpdate({ firebaseUid: selfSocket.data.firebaseUid }, { isInCall: true, currentRoomId: roomId, lastActive: new Date() }).catch(err => console.error('Failed to update call status:', err));
  if (partnerSocket.data.firebaseUid) User.findOneAndUpdate({ firebaseUid: partnerSocket.data.firebaseUid }, { isInCall: true, currentRoomId: roomId, lastActive: new Date() }).catch(err => console.error('Failed to update call status:', err));
  selfSocket.data.currentRoomId = roomId; partnerSocket.data.currentRoomId = roomId;
  const qualityOrder = ['low', 'medium', 'high', 'hd']; const roomQuality = qualityOrder[Math.min(qualityOrder.indexOf(selfSocket.data.videoQuality || 'medium'), qualityOrder.indexOf(partnerSocket.data.videoQuality || 'medium'))];
  const roomData = { roomId, videoQuality: { current: roomQuality, settings: VIDEO_QUALITY[roomQuality], available: Object.keys(VIDEO_QUALITY).map(key => ({ id: key, label: VIDEO_QUALITY[key].label, description: VIDEO_QUALITY[key].description })), switchMode: selfSocket.data.qualitySwitchMode || 'hybrid', adaptiveBitrate: appConfig.videoQuality.adaptiveBitrate, networkThresholds: appConfig.videoQuality.networkThresholds }, iceServers: ICE_SERVERS, autoMatched: true };
  selfSocket.emit('room-joined', { ...roomData, peers: [{ socketId: partnerSocket.id, ...partnerData }] }); partnerSocket.emit('room-joined', { ...roomData, peers: [{ socketId: selfSocket.id, ...selfData }] });
}

async function endCall(roomId, endedBySocketId) {
  const activeCall = activeCalls.get(roomId); if (!activeCall) return;
  const endTime = Date.now(); const duration = Math.floor((endTime - activeCall.startTime) / 1000);
  try { await CallHistory.create({ roomId, callerFirebaseUid: activeCall.callerUid, receiverFirebaseUid: activeCall.receiverUid, startTime: new Date(activeCall.startTime), endTime: new Date(endTime), duration, endedBy: endedBySocketId, callQuality: 'medium' }); } catch (err) { console.error('Failed to save call history:', err); }
  for (const uid of [activeCall.callerUid, activeCall.receiverUid]) { if (uid) User.findOneAndUpdate({ firebaseUid: uid }, { $inc: { totalCalls: 1, totalCallDuration: duration }, isInCall: false, currentRoomId: null, lastActive: new Date() }).catch(err => console.error('Failed to update call stats:', err)); }
  if (duration < 10 && activeCall.receiverUid) await createNotification(activeCall.receiverUid, 'Missed Call', 'Someone tried to connect with you', 'call');
  activeCalls.delete(roomId);
}

function attemptMatch(newSocketId) {
  const socket = io.sockets.sockets.get(newSocketId); if (!socket) return;
  if (socket.data.currentRoomId) { socket.emit('error', { message: 'You are already in a call' }); return; }
  if (!randomQueue.includes(newSocketId)) randomQueue.push(newSocketId);
  if (randomQueue.length < 2) return;
  const idxSelf = randomQueue.indexOf(newSocketId); if (idxSelf === -1) return;
  let partnerIdx = -1;
  for (let i = 0; i < randomQueue.length; i++) { if (i === idxSelf) continue; const candidateSocket = io.sockets.sockets.get(randomQueue[i]); if (candidateSocket && !candidateSocket.data.currentRoomId) { partnerIdx = i; break; } randomQueue.splice(i, 1); if (i < idxSelf) idxSelf--; i--; }
  if (partnerIdx === -1) return;
  const partnerId = randomQueue[partnerIdx]; const partnerSocket = io.sockets.sockets.get(partnerId);
  if (!partnerSocket || partnerSocket.data.currentRoomId) { removeFromQueue(partnerId); attemptMatch(newSocketId); return; }
  const highIdx = Math.max(idxSelf, partnerIdx); const lowIdx = Math.min(idxSelf, partnerIdx); randomQueue.splice(highIdx, 1); randomQueue.splice(lowIdx, 1);
  _createRoom(socket, partnerSocket);
}

const verifyApiKey = (req, res, next) => { const key = req.headers['x-api-key']; if (!key) return res.status(401).json({ error: 'API key required' }); if (key !== API_KEY) return res.status(403).json({ error: 'Invalid API key' }); next(); };

async function initDB() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 }); console.log('MongoDB connected');
  let cfg = await AppConfigModel.findById('main').lean();
  if (!cfg) { cfg = { _id: 'main', videoQuality: { default: 'medium', autoAdjust: true, maxBitrate: 1500000, allowedQualities: ['low', 'medium', 'high', 'hd'], adaptiveBitrate: true, networkThresholds: { excellent: 5000, good: 2000, fair: 800, poor: 300 } }, safety: { reportingEnabled: true, contentModeration: true, maxReportsBeforeReview: 5 }, termsVersion: '1.0.0', latestAppVersion: '1.0.0', minimumAppVersion: '1.0.0' }; await AppConfigModel.create(cfg); }
  appConfig = cfg;
}

// ==================== ROUTES ====================

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), activeCalls: activeCalls.size, queueLength: randomQueue.length, serviceName: SERVICE_NAME }));

// Google OAuth
app.get('/auth/google/mobile', verifyApiKey, async (req, res) => { if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(503).json({ error: 'Google OAuth not configured.' }); const redirect = req.query.redirect || 'oreyapp://auth'; const state = Buffer.from(JSON.stringify({ redirect })).toString('base64'); const authUrl = googleOAuth2Client.generateAuthUrl({ access_type: 'online', prompt: 'select_account', scope: ['openid', 'profile', 'email'], state, display: 'touch', response_type: 'code' }); return res.json({ authUrl, redirectUri: GOOGLE_REDIRECT_URI, message: 'Open this URL in a browser' }); });
app.get('/auth/google', (req, res) => { if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(503).send('Google OAuth not configured.'); const state = req.query.redirect ? Buffer.from(JSON.stringify({ redirect: req.query.redirect })).toString('base64') : undefined; const authUrl = googleOAuth2Client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['openid', 'profile', 'email'], ...(state ? { state } : {}) }); res.redirect(authUrl); });
app.get('/auth/google/callback', async (req, res) => { /* OAuth callback unchanged */ });

// User APIs
app.post('/api/user/create', verifyApiKey, async (req, res) => { const { uid, email, displayName } = req.body; if (!uid || !email) return res.status(400).json({ error: 'uid and email required' }); try { const { user, conflict } = await upsertUserFromGoogle({ uid, email, name: displayName || email.split('@')[0], picture: null }); if (conflict) return res.status(409).json({ error: 'User already exists' }); res.json({ success: true, user }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/auth/google', verifyApiKey, async (req, res) => { /* unchanged */ });
app.get('/api/user/profile', verifyApiKey, async (req, res) => { const { firebaseUid } = req.query; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); const user = await User.findOne({ firebaseUid }).select('-__v'); if (!user) return res.status(404).json({ error: 'User not found' }); res.json({ user }); });
app.post('/api/user/verify-age', verifyApiKey, async (req, res) => { /* unchanged */ });
app.post('/api/accept-terms', verifyApiKey, async (req, res) => { /* unchanged */ });
app.post('/api/user/update-gender', verifyApiKey, async (req, res) => { /* unchanged */ });
app.post('/api/user/update-gender-preference', verifyApiKey, async (req, res) => { /* unchanged */ });
app.post('/api/user/update-interests', verifyApiKey, async (req, res) => { /* unchanged */ });
app.post('/api/user/update-video-quality', verifyApiKey, async (req, res) => { /* unchanged */ });
app.get('/api/call-history', verifyApiKey, async (req, res) => { const { firebaseUid, limit = 20 } = req.query; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); try { const history = await CallHistory.find({ $or: [{ callerFirebaseUid: firebaseUid }, { receiverFirebaseUid: firebaseUid }] }).sort({ startTime: -1 }).limit(parseInt(limit)).lean(); const formattedHistory = history.map(call => ({ id: call._id.toString(), roomId: call.roomId, partnerId: call.callerFirebaseUid === firebaseUid ? call.receiverFirebaseUid : call.callerFirebaseUid, duration: call.duration, date: new Date(call.startTime).toISOString().split('T')[0], time: new Date(call.startTime).toTimeString().split(' ')[0].substring(0, 5), type: call.callerFirebaseUid === firebaseUid ? 'outgoing' : 'incoming', endedBy: call.endedBy })); res.json({ history: formattedHistory }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/device/register', verifyApiKey, async (req, res) => { /* unchanged */ });

// Notifications
app.get('/api/notifications', verifyApiKey, async (req, res) => { const { firebaseUid, limit = 50 } = req.query; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); try { const notifications = await Notification.find({ firebaseUid }).sort({ createdAt: -1 }).limit(parseInt(limit)).lean(); const count = await Notification.countDocuments({ firebaseUid, read: false }); res.json({ notifications, unreadCount: count }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/notifications/mark-read', verifyApiKey, async (req, res) => { const { firebaseUid, notificationId } = req.body; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); try { if (notificationId) await Notification.findOneAndUpdate({ _id: notificationId, firebaseUid }, { read: true }); else await Notification.updateMany({ firebaseUid, read: false }, { read: true }); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.delete('/api/notifications/clear', verifyApiKey, async (req, res) => { const { firebaseUid } = req.body; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); try { await Notification.deleteMany({ firebaseUid }); res.json({ success: true }); } catch (error) { res.status(500).json({ error: error.message }); } });

// Leaderboard
app.get('/api/leaderboard', verifyApiKey, async (req, res) => { const { period = 'weekly', limit = 50 } = req.query; const sortField = period === 'monthly' ? 'monthlyScore' : period === 'alltime' ? 'allTimeScore' : 'weeklyScore'; try { const leaders = await Leaderboard.find({}).sort({ [sortField]: -1 }).limit(parseInt(limit)).select('displayName oreyId weeklyScore monthlyScore allTimeScore badges').lean(); res.json({ leaders, period }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/leaderboard/update', verifyApiKey, async (req, res) => { const { firebaseUid, displayName, oreyId, type, points = 10 } = req.body; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); try { let entry = await Leaderboard.findOne({ firebaseUid }); if (!entry) entry = new Leaderboard({ firebaseUid, displayName: displayName || 'Player', oreyId: oreyId || 'OREY-XXXXX' }); if (type === 'chat') { entry.weeklyChats += 1; entry.monthlyChats += 1; entry.allTimeChats += 1; } else if (type === 'game') { entry.weeklyGames += 1; } entry.weeklyScore += points; entry.monthlyScore += points; entry.allTimeScore += points; entry.lastUpdated = new Date(); await entry.save(); res.json({ success: true, entry }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/leaderboard/rank', verifyApiKey, async (req, res) => { const { firebaseUid, period = 'weekly' } = req.query; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); const sortField = period === 'monthly' ? 'monthlyScore' : period === 'alltime' ? 'allTimeScore' : 'weeklyScore'; try { const userEntry = await Leaderboard.findOne({ firebaseUid }); if (!userEntry) return res.json({ rank: null, score: 0 }); const rank = await Leaderboard.countDocuments({ [sortField]: { $gt: userEntry[sortField] } }); res.json({ rank: rank + 1, score: userEntry[sortField], badges: userEntry.badges }); } catch (error) { res.status(500).json({ error: error.message }); } });

// Games
app.get('/api/games/questions', verifyApiKey, async (req, res) => { const { gameType, limit = 10 } = req.query; if (!gameType) return res.status(400).json({ error: 'gameType required' }); try { const questions = await GameQuestion.find({ gameType }).select('-correctAnswer').limit(parseInt(limit)).lean(); res.json({ questions }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.post('/api/games/submit', verifyApiKey, async (req, res) => { const { firebaseUid, gameType, questionId, answer } = req.body; if (!firebaseUid || !gameType || !questionId || !answer) return res.status(400).json({ error: 'Missing required fields' }); try { const question = await GameQuestion.findById(questionId); if (!question) return res.status(404).json({ error: 'Question not found' }); const isCorrect = question.correctAnswer.toLowerCase() === answer.toLowerCase(); const points = isCorrect ? 20 : 0; await GameScore.create({ firebaseUid, gameType, score: points }); if (isCorrect) { try { await fetch(`http://localhost:${PORT}/api/leaderboard/update`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY }, body: JSON.stringify({ firebaseUid, type: 'game', points }) }); } catch (e) {} } res.json({ correct: isCorrect, points, correctAnswer: question.correctAnswer }); } catch (error) { res.status(500).json({ error: error.message }); } });
app.get('/api/games/stats', verifyApiKey, async (req, res) => { const { firebaseUid } = req.query; if (!firebaseUid) return res.status(400).json({ error: 'firebaseUid required' }); try { const scores = await GameScore.aggregate([{ $match: { firebaseUid } }, { $group: { _id: '$gameType', totalScore: { $sum: '$score' }, gamesPlayed: { $sum: 1 } } }]); res.json({ stats: scores }); } catch (error) { res.status(500).json({ error: error.message }); } });

// Config
app.get('/api/config', (req, res) => { res.json({ features: { videoCall: true, chat: true, reporting: true, safetyFeatures: true, genderMatching: true, videoQualityControl: true, adaptiveBitrate: appConfig.videoQuality.adaptiveBitrate, googleAuth: !!firebaseApp, callHistory: true, interestTags: true, sosButton: true, leaderboard: true, games: true }, videoQuality: { ...appConfig.videoQuality, options: Object.keys(VIDEO_QUALITY).map(key => ({ id: key, ...VIDEO_QUALITY[key] })), modes: QUALITY_SWITCH_MODES }, interestTags: INTEREST_TAGS, iceServers: ICE_SERVERS, safety: appConfig.safety, reportReasons: REPORT_REASONS, termsVersion: appConfig.termsVersion, serviceName: SERVICE_NAME, stickers: [{ id: 'wave', label: 'Wave' }, { id: 'heart', label: 'Heart' }, { id: 'laugh', label: 'Laugh' }, { id: 'thumbsup', label: 'Thumbs Up' }, { id: 'fire', label: 'Fire' }, { id: 'cool', label: 'Cool' }, { id: 'cry', label: 'Cry' }, { id: 'angry', label: 'Angry' }] }); });
app.get('/api/version', (req, res) => { res.json({ currentVersion: '2.0.0', latestVersion: appConfig.latestAppVersion || '1.0.0', minimumVersion: appConfig.minimumAppVersion || '1.0.0', updateAvailable: false, updateType: 'none', playStoreUrl: 'https://play.google.com/store/apps/details?id=com.orey.app', message: 'You are using the latest version', features: ['google-auth', 'google-oauth-redirect', 'video-quality-switching', 'adaptive-bitrate', 'call-history', 'verification-gates', 'gender-preference', 'interest-tags', 'in-call-chat', 'sos-button', 'leaderboard', 'games'] }); });

// ==================== SOCKET.IO ====================

const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] }, maxHttpBufferSize: 1e7, pingTimeout: 60000, pingInterval: 25000 });
const genderMatcher = createGenderMatcher(io);

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} (Total: ${io.engine.clientsCount})`);
  socket.emit('config', { videoQuality: { ...appConfig.videoQuality, options: Object.keys(VIDEO_QUALITY).map(key => ({ id: key, ...VIDEO_QUALITY[key] })) }, iceServers: ICE_SERVERS, serviceName: SERVICE_NAME });

  socket.on('register-device', async ({ deviceId, firebaseUid, videoQuality, qualitySwitchMode }) => { /* unchanged */ });
  socket.on('register-orey-id', ({ oreyId, userName, firebaseUid }) => { /* unchanged */ });
  socket.on('connect-via-orey-id', async ({ targetOreyId }) => { /* unchanged */ });
  socket.on('join-random', async () => { /* unchanged */ });
  socket.on('cancel-random', () => { /* unchanged */ });
  socket.on('skip', async ({ roomId }) => { /* unchanged */ });
  socket.on('leave-chat', async ({ roomId }) => { /* unchanged */ });
  socket.on('send-message', ({ roomId, message, senderName }) => { /* unchanged */ });
  socket.on('sos-report', async ({ roomId, reason, description }) => { /* unchanged */ });
  socket.on('offer', ({ targetId, offer }) => { io.to(targetId).emit('offer', { offer, fromId: socket.id }); });
  socket.on('answer', ({ targetId, answer }) => { io.to(targetId).emit('answer', { answer, fromId: socket.id }); });
  socket.on('ice-candidate', ({ targetId, candidate }) => { io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id }); });

  // Random Text Chat
  socket.on('join-random-chat', async () => {
    if (socket.data.currentRoomId) { socket.emit('error', { message: 'You are already in a chat' }); return; }
    const existingIdx = chatQueue.indexOf(socket.id); if (existingIdx !== -1) chatQueue.splice(existingIdx, 1);
    chatQueue.push(socket.id); socket.emit('chat-waiting');
    if (chatQueue.length >= 2) {
      const partnerId = chatQueue.shift(); const selfId = chatQueue.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId); const selfSocket = io.sockets.sockets.get(selfId);
      if (partnerSocket && selfSocket && !partnerSocket.data.currentRoomId && !selfSocket.data.currentRoomId) {
        const roomId = 'chat_' + generateRoomId(); selfSocket.join(roomId); partnerSocket.join(roomId);
        selfSocket.data.currentRoomId = roomId; partnerSocket.data.currentRoomId = roomId;
        const chatRoom = new ChatRoom({ roomId, participants: [selfSocket.data.firebaseUid, partnerSocket.data.firebaseUid].filter(Boolean), isActive: true }); await chatRoom.save();
        const partnerName = partnerSocket.data.userName || 'Stranger'; const selfName = selfSocket.data.userName || 'Stranger';
        selfSocket.emit('chat-matched', { roomId, partnerName }); partnerSocket.emit('chat-matched', { roomId, partnerName: selfName });
        updateLeaderboard(selfSocket, 'chat'); updateLeaderboard(partnerSocket, 'chat');
      }
    }
  });

  socket.on('chat-message', async ({ roomId, message, type = 'text', stickerId }) => {
    if (!roomId || !message) return;
    const chatRoom = await ChatRoom.findOne({ roomId }); if (!chatRoom) return;
    const msgData = { senderUid: socket.data.firebaseUid, senderName: socket.data.userName || 'Anonymous', message, type, stickerId, timestamp: new Date() };
    chatRoom.messages.push(msgData); await chatRoom.save();
    socket.to(roomId).emit('chat-message', msgData); socket.emit('chat-message-sent', msgData);
  });

  socket.on('leave-random-chat', async ({ roomId }) => {
    if (roomId) { socket.leave(roomId); socket.to(roomId).emit('chat-partner-left', { message: 'Partner left the chat' }); await ChatRoom.findOneAndUpdate({ roomId }, { isActive: false, endedAt: new Date() }); socket.data.currentRoomId = null; socket.emit('chat-left'); }
  });

  socket.on('cancel-random-chat', () => { const idx = chatQueue.indexOf(socket.id); if (idx !== -1) chatQueue.splice(idx, 1); socket.emit('chat-cancelled'); });

  socket.on('disconnect', async () => {
    console.log(`[-] ${socket.id}`); removeFromQueue(socket.id);
    const chatIdx = chatQueue.indexOf(socket.id); if (chatIdx !== -1) chatQueue.splice(chatIdx, 1);
    if (socket.data.oreyId) { const entry = oreyIds.get(socket.data.oreyId); if (entry && entry.socketId === socket.id) entry.socketId = null; }
    if (socket.data.currentRoomId) { await endCall(socket.data.currentRoomId, socket.id); }
    const result = removeSocketFromRooms(socket.id);
    if (result) { const { roomId, peers } = result; for (const [pid] of peers.entries()) { const ps = io.sockets.sockets.get(pid); if (ps) { ps.emit('partner-left', { reason: 'disconnected' }); ps.data.currentRoomId = null; } } if (peers.size === 0) rooms.delete(roomId); }
    if (socket.data.firebaseUid) { User.findOneAndUpdate({ firebaseUid: socket.data.firebaseUid }, { isInCall: false, currentRoomId: null, lastActive: new Date() }).catch(err => console.error('Failed to update user status on disconnect:', err)); }
  });
});

// Cron jobs
setInterval(async () => { const now = new Date(); if (now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0) { await Leaderboard.updateMany({}, { weeklyScore: 0, weeklyChats: 0, weeklyGames: 0 }); console.log('Weekly leaderboard reset'); } }, 60000);
setInterval(async () => { const now = new Date(); if (now.getDate() === 1 && now.getHours() === 0 && now.getMinutes() === 0) { await Leaderboard.updateMany({}, { monthlyScore: 0, monthlyChats: 0 }); console.log('Monthly leaderboard reset'); } }, 60000);
setInterval(cleanExpiredOreyIds, 10 * 60 * 1000);

async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log('================================================');
      console.log(`${SERVICE_NAME} running on port ${PORT}`);
      console.log(`Firebase: ${firebaseApp ? 'Configured' : 'Not configured'}`);
      console.log(`Rate limiting: Enabled`);
      console.log(`Notifications: Ready`);
      console.log(`Leaderboard: Ready`);
      console.log(`Games: Ready`);
      console.log(`Random Chat: Ready`);
      console.log('================================================');
    });
  } catch (err) { console.error('Startup failed:', err.message); process.exit(1); }
}
start();
