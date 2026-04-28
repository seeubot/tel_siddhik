const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);
app.use('/admin/', apiLimiter);

app.use(express.json());

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS = 5000;
const API_KEY = process.env.API_KEY || 'oryx_2024_secure_key_change_this';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_change_this';
const AUTO_BAN_THRESHOLD = 3;
const DEFAULT_BAN_DURATION_HOURS = 720;

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

const oreyIds = new Map();
const rooms = new Map();
const randomQueue = [];
const autoSearchTimers = new Map();
const bannedDevices = new Map();
const reports = new Map();
const userReportCount = new Map();
const userHighPriorityReportCount = new Map();
const reporterHistory = new Map();

const HIGH_PRIORITY_REASONS = [
  'Nudity / Sexual Content',
  'Sexual Harassment',
  'Underage User',
  'Violence / Threats'
];

let notifications = [
  {
    id: 1,
    title: "🎉 Welcome to Orey!",
    message: "Start video calling with friends using Orey-ID. Swipe to discover new people!",
    type: "info",
    priority: "normal",
    timestamp: new Date().toISOString(),
    actionUrl: "/welcome",
    icon: "🎉",
    imageUrl: "https://i.postimg.cc/cLq03ZZg/IMG-20260428-WA0002.jpg",
    isRead: false,
    expiresIn: 30
  }
];

let appConfig = {
  android: {
    versionCode: 1,
    versionName: "1.0.0",
    updateType: "flexible",
    updatePriority: 2,
    updateMessage: "New features available! Update for better experience.",
    updateTitle: "Update Available",
    whatsNew: ["HD Video quality support", "Push notifications", "Improved connection stability", "Bug fixes"],
    forceUpdateMinVersion: 1,
    downloadUrl: "https://play.google.com/store/apps/details?id=com.orey.app",
    changelog: "https://orey.app/changelog"
  },
  maintenance: { enabled: false, message: "We're improving Orey. Back soon!" },
  videoQuality: { default: "medium", autoAdjust: true, maxBitrate: 1500000 }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateOreyId() { return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase(); }
function generateRoomId() { return uuidv4().replace(/-/g, '').substring(0, 8).toLowerCase(); }

function cleanExpiredOreyIds() {
  const now = Date.now();
  for (const [id, data] of oreyIds.entries()) { if (data.expiresAt < now) oreyIds.delete(id); }
}

function removeFromQueue(socketId) { const idx = randomQueue.indexOf(socketId); if (idx !== -1) randomQueue.splice(idx, 1); }

function removeSocketFromRooms(socketId) {
  for (const [roomId, peers] of rooms.entries()) {
    if (peers.has(socketId)) { peers.delete(socketId); if (peers.size === 0) rooms.delete(roomId); return { roomId, peers }; }
  }
  return null;
}

function scheduleAutoSearch(socket, delay = AUTO_SEARCH_DELAY_MS) {
  cancelAutoSearch(socket.id);
  const timer = setTimeout(() => { autoSearchTimers.delete(socket.id); randomQueue.push(socket.id); attemptMatch(socket.id); }, delay);
  autoSearchTimers.set(socket.id, timer);
  socket.emit('auto-search-scheduled', { delay });
}

function cancelAutoSearch(socketId) { const timer = autoSearchTimers.get(socketId); if (timer) { clearTimeout(timer); autoSearchTimers.delete(socketId); } }

function attemptMatch(newSocketId) {
  if (randomQueue.length < 2) return;
  const idxSelf = randomQueue.indexOf(newSocketId);
  if (idxSelf === -1) return;
  let partnerIdx = -1;
  for (let i = 0; i < randomQueue.length; i++) { if (i !== idxSelf) { partnerIdx = i; break; } }
  if (partnerIdx === -1) return;
  const [selfId, partnerId] = [randomQueue[idxSelf], randomQueue[partnerIdx]];
  const highIdx = Math.max(idxSelf, partnerIdx), lowIdx = Math.min(idxSelf, partnerIdx);
  randomQueue.splice(highIdx, 1); randomQueue.splice(lowIdx, 1);
  const roomId = generateRoomId(); rooms.set(roomId, new Map());
  const selfSocket = io.sockets.sockets.get(selfId), partnerSocket = io.sockets.sockets.get(partnerId);
  if (!selfSocket || !partnerSocket) return;
  selfSocket.join(roomId); partnerSocket.join(roomId);
  const selfData = { userName: selfSocket.data.userName || 'Anonymous', oreyId: selfSocket.data.oreyId || null, deviceId: selfSocket.data.deviceId || null };
  const partnerData = { userName: partnerSocket.data.userName || 'Anonymous', oreyId: partnerSocket.data.oreyId || null, deviceId: partnerSocket.data.deviceId || null };
  rooms.get(roomId).set(selfId, selfData); rooms.get(roomId).set(partnerId, partnerData);
  const roomData = { roomId, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS, autoMatched: true };
  selfSocket.emit('room-joined', { ...roomData, peers: [{ socketId: partnerId, ...partnerData }] });
  partnerSocket.emit('room-joined', { ...roomData, peers: [{ socketId: selfId, ...selfData }] });
  selfSocket.emit('incoming-call', { fromName: partnerData.userName, fromOreyId: partnerData.oreyId, autoMatched: true });
  partnerSocket.emit('incoming-call', { fromName: selfData.userName, fromOreyId: selfData.oreyId, autoMatched: true });
}

function isDeviceBanned(deviceId) {
  if (!deviceId) return null;
  const banInfo = bannedDevices.get(deviceId);
  if (!banInfo) return null;
  if (banInfo.expiresAt && Date.now() > banInfo.expiresAt) { bannedDevices.delete(deviceId); return null; }
  return banInfo;
}

function banDeviceAndDisconnect(deviceId, banInfo) {
  bannedDevices.set(deviceId, banInfo);
  const socketsToDisconnect = [];
  for (const [socketId, socket] of io.sockets.sockets) { if (socket.data.deviceId === deviceId) socketsToDisconnect.push(socketId); }
  for (const socketId of socketsToDisconnect) { const socket = io.sockets.sockets.get(socketId); if (socket) { socket.emit('device-banned', banInfo); socket.disconnect(true); } }
  console.log(`🚫 Banned: ${deviceId.substring(0, 12)}... - ${socketsToDisconnect.length} sockets`);
  return socketsToDisconnect.length;
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────
const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'API key required' });
  if (apiKey !== API_KEY) return res.status(403).json({ error: 'Invalid API key' });
  next();
};

const verifyAdminKey = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) return res.status(401).json({ error: 'Admin key required' });
  if (adminKey !== ADMIN_KEY) return res.status(403).json({ error: 'Invalid admin key' });
  next();
};

// ─── Public Endpoints ───────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), activeConnections: io.engine.clientsCount, bannedDevices: bannedDevices.size, totalReports: reports.size, memory: process.memoryUsage().heapUsed / 1024 / 1024 });
});

app.get('/generate-orey-id', (_req, res) => {
  cleanExpiredOreyIds();
  const oreyId = generateOreyId(), expiresAt = Date.now() + OREY_ID_TTL_MS;
  oreyIds.set(oreyId, { expiresAt, socketId: null, userName: '' });
  res.json({ oreyId, expiresAt });
});

app.get('/create-room', (_req, res) => { res.json({ roomId: generateRoomId() }); });

app.get('/api/get-key-hash', (_req, res) => {
  res.json({ hash: crypto.createHash('sha256').update(API_KEY).digest('hex').substring(0, 32) });
});

// ─── App API Endpoints ──────────────────────────────────────────────────────
app.get('/api/version', (req, res) => {
  const platform = req.query.platform || 'android', clientVersion = parseInt(req.query.version) || 0;
  const platformConfig = appConfig[platform];
  if (!platformConfig) return res.status(400).json({ error: 'Invalid platform' });
  res.json(clientVersion < platformConfig.versionCode ? { updateAvailable: true, ...platformConfig } : { updateAvailable: false, currentVersion: platformConfig.versionName });
});

app.get('/api/notifications', (req, res) => {
  const lastId = parseInt(req.query.after_id) || 0;
  let filtered = notifications.filter(n => n.id > lastId);
  const now = new Date();
  filtered = filtered.filter(n => {
    if (n.expiresIn) { const expiry = new Date(n.timestamp); expiry.setDate(expiry.getDate() + n.expiresIn); return now <= expiry; }
    return true;
  });
  res.json({ notifications: filtered, total: notifications.length, unread: notifications.filter(n => !n.isRead).length, lastSync: new Date().toISOString() });
});

app.get('/api/config', (req, res) => {
  const clientVersion = parseInt(req.query.version) || 0;
  res.json({ features: { videoCall: true, hdVideo: clientVersion >= 2, groupCall: false, screenShare: clientVersion >= 3 }, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS, urls: { mainApp: process.env.MAIN_APP_URL || "https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/", help: "https://orey.app/help" }, maintenance: appConfig.maintenance });
});

// ─── Device & Report Endpoints ──────────────────────────────────────────────
app.post('/api/device/register', verifyApiKey, (req, res) => {
  const { deviceId, platform } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const banInfo = isDeviceBanned(deviceId);
  if (banInfo) return res.status(403).json({ error: 'Device is banned', banned: true, reason: banInfo.reason, timestamp: banInfo.timestamp, expiresAt: banInfo.expiresAt || null, durationHours: banInfo.durationHours || null, permanent: !banInfo.expiresAt });
  console.log(`📱 Device registered: ${deviceId.substring(0, 12)}...`);
  res.json({ success: true, deviceId, registered: true, timestamp: new Date().toISOString() });
});

app.post('/api/device/check-ban', verifyApiKey, (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const banInfo = isDeviceBanned(deviceId);
  if (banInfo) return res.status(403).json({ banned: true, ...banInfo });
  res.json({ banned: false });
});

app.post('/api/report', verifyApiKey, (req, res) => {
  const { reporterDeviceId, reportedDeviceId, reportedUserId, reason, description, evidence } = req.body;
  if (!reportedDeviceId || !reason) return res.status(400).json({ error: 'reportedDeviceId and reason are required' });
  if (!reporterDeviceId) return res.status(400).json({ error: 'reporterDeviceId is required' });
  if (reporterDeviceId === reportedDeviceId) return res.status(400).json({ error: 'Cannot report yourself' });
  const reportedByReporter = reporterHistory.get(reporterDeviceId) || new Set();
  if (reportedByReporter.has(reportedDeviceId)) return res.status(400).json({ error: 'Already reported this user', alreadyReported: true });
  
  const reportId = generateRoomId();
  const isHighPriority = HIGH_PRIORITY_REASONS.includes(reason);
  const report = { id: reportId, reporterDeviceId, reportedDeviceId, reportedUserId: reportedUserId || null, reason, description: description || '', evidence: evidence || null, timestamp: new Date().toISOString(), status: 'pending', reviewedBy: null, reviewNotes: '', reviewedAt: null, autoBanned: false, isHighPriority };
  reports.set(reportId, report);
  reportedByReporter.add(reportedDeviceId);
  reporterHistory.set(reporterDeviceId, reportedByReporter);
  
  const currentCount = (userReportCount.get(reportedDeviceId) || 0) + 1;
  userReportCount.set(reportedDeviceId, currentCount);
  if (isHighPriority) { const hc = (userHighPriorityReportCount.get(reportedDeviceId) || 0) + 1; userHighPriorityReportCount.set(reportedDeviceId, hc); }
  
  console.log(`🚨 Report #${reportId}: ${reportedDeviceId.substring(0, 12)}... for "${reason}" (HP:${isHighPriority})`);
  
  let autoBanned = false, banInfo = null;
  const highPriorityCount = userHighPriorityReportCount.get(reportedDeviceId) || 0;
  if ((isHighPriority && highPriorityCount >= 2) || currentCount >= AUTO_BAN_THRESHOLD) {
    const banDuration = isHighPriority ? 0 : DEFAULT_BAN_DURATION_HOURS;
    banInfo = { reason: isHighPriority ? `Auto-banned (HIGH PRIORITY): ${highPriorityCount} reports for "${reason}"` : `Auto-banned: ${currentCount} reports | Latest: ${reason}`, timestamp: new Date().toISOString(), expiresAt: banDuration > 0 ? Date.now() + (banDuration * 3600000) : null, durationHours: banDuration > 0 ? banDuration : null, permanent: banDuration === 0, source: 'auto', isHighPriority, reportIds: [] };
    for (const [rId, r] of reports.entries()) { if (r.reportedDeviceId === reportedDeviceId) { banInfo.reportIds.push(rId); r.status = 'auto_banned'; r.autoBanned = true; } }
    report.status = 'auto_banned'; report.autoBanned = true;
    banDeviceAndDisconnect(reportedDeviceId, banInfo);
    autoBanned = true;
    console.log(`🤖 AUTO-BANNED: ${reportedDeviceId.substring(0, 12)}...`);
  }
  res.json({ success: true, reportId, reportCount: currentCount, isHighPriority, autoBanned, banInfo: banInfo || null });
});

// ─── Admin Notification Endpoints ───────────────────────────────────────────
app.get('/admin/notifications', verifyAdminKey, (_req, res) => {
  res.json({ notifications, total: notifications.length, active: notifications.filter(n => { if (n.expiresIn) { const e = new Date(n.timestamp); e.setDate(e.getDate() + n.expiresIn); return new Date() <= e; } return true; }).length });
});

app.post('/admin/notifications', verifyAdminKey, (req, res) => {
  const { title, message, type, priority, actionUrl, icon, imageUrl, expiresIn } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });
  const newId = notifications.length > 0 ? Math.max(...notifications.map(n => n.id)) + 1 : 1;
  const newNotification = { id: newId, title, message, type: type || 'info', priority: priority || 'normal', timestamp: new Date().toISOString(), actionUrl: actionUrl || '/', icon: icon || '📢', imageUrl: imageUrl || null, isRead: false, expiresIn: expiresIn || 30 };
  notifications.push(newNotification);
  io.emit('new-notification', newNotification);
  console.log(`📢 Notification sent: "${title}" to ${io.engine.clientsCount} clients`);
  res.json({ success: true, notification: newNotification, activeClients: io.engine.clientsCount });
});

app.delete('/admin/notifications/:id', verifyAdminKey, (req, res) => {
  const id = parseInt(req.params.id), index = notifications.findIndex(n => n.id === id);
  if (index === -1) return res.status(404).json({ error: 'Notification not found' });
  const deleted = notifications.splice(index, 1)[0];
  res.json({ success: true, deleted });
});

app.put('/api/version', verifyAdminKey, (req, res) => {
  const { platform, versionCode, versionName, updateType, updateMessage, downloadUrl, whatsNew } = req.body;
  if (!platform || !versionCode) return res.status(400).json({ error: 'Platform and versionCode required' });
  if (!appConfig[platform]) appConfig[platform] = {};
  Object.assign(appConfig[platform], { versionCode, versionName: versionName || `v${versionCode}`, updateType: updateType || 'flexible', updateMessage: updateMessage || 'New update available!', downloadUrl: downloadUrl || appConfig[platform].downloadUrl });
  if (whatsNew) appConfig[platform].whatsNew = whatsNew;
  io.emit('update-available', appConfig[platform]);
  res.json({ success: true, config: appConfig[platform] });
});

app.post('/admin/maintenance', verifyAdminKey, (req, res) => {
  const { enabled, message } = req.body;
  appConfig.maintenance = { enabled: enabled || false, message: message || '' };
  io.emit('maintenance-mode', appConfig.maintenance);
  console.log(`🔧 Maintenance ${enabled ? 'ENABLED' : 'DISABLED'}`);
  res.json({ success: true, maintenance: appConfig.maintenance });
});

app.put('/admin/video-quality', verifyAdminKey, (req, res) => {
  const { default: def, autoAdjust, maxBitrate } = req.body;
  if (def && VIDEO_QUALITY[def]) appConfig.videoQuality.default = def;
  if (autoAdjust !== undefined) appConfig.videoQuality.autoAdjust = autoAdjust;
  if (maxBitrate) appConfig.videoQuality.maxBitrate = maxBitrate;
  io.emit('video-quality-update', appConfig.videoQuality);
  res.json({ success: true, videoQuality: appConfig.videoQuality });
});

// ─── Admin Report Endpoints ─────────────────────────────────────────────────
app.get('/admin/reports', verifyAdminKey, (req, res) => {
  const status = req.query.status;
  const allReports = [];
  for (const [id, report] of reports.entries()) { if (status && report.status !== status) continue; allReports.push({ id, ...report }); }
  allReports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ reports: allReports, total: allReports.length, pending: [...reports.values()].filter(r => r.status === 'pending').length, autoBanned: [...reports.values()].filter(r => r.status === 'auto_banned').length, activeBans: bannedDevices.size });
});

app.post('/admin/reports/:reportId/action', verifyAdminKey, (req, res) => {
  const { reportId } = req.params, { action, banDuration, notes } = req.body;
  const report = reports.get(reportId);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (report.status !== 'pending') return res.status(400).json({ error: `Report already ${report.status}` });
  report.reviewedAt = new Date().toISOString(); report.reviewNotes = notes || '';
  switch (action) {
    case 'ban': {
      const d = banDuration || DEFAULT_BAN_DURATION_HOURS;
      const bi = { reason: report.reason, timestamp: new Date().toISOString(), expiresAt: d > 0 ? Date.now() + (d * 3600000) : null, durationHours: d > 0 ? d : null, permanent: d === 0, source: 'admin', reportIds: [reportId] };
      banDeviceAndDisconnect(report.reportedDeviceId, bi); report.status = 'banned'; break;
    }
    case 'dismiss': report.status = 'dismissed'; break;
    case 'warn': {
      report.status = 'warned';
      for (const [sid, s] of io.sockets.sockets) { if (s.data.deviceId === report.reportedDeviceId) s.emit('warning', { reason: report.reason, message: 'You have received a warning.' }); }
      break;
    }
    default: return res.status(400).json({ error: 'Invalid action' });
  }
  res.json({ success: true, report });
});

// ─── FIXED: Admin Ban Endpoints ─────────────────────────────────────────────
app.post('/admin/ban-device', verifyAdminKey, (req, res) => {
  const { deviceId, reason, durationHours } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });
  const existing = isDeviceBanned(deviceId);
  if (existing) return res.status(400).json({ error: 'Device is already banned', existingBan: existing });
  const bi = { reason: reason || 'Violation of terms', timestamp: new Date().toISOString(), expiresAt: durationHours ? Date.now() + (durationHours * 3600000) : null, durationHours: durationHours || null, permanent: !durationHours, source: 'manual' };
  const dced = banDeviceAndDisconnect(deviceId, bi);
  res.json({ success: true, deviceId: deviceId.substring(0, 12) + '...', banInfo: bi, socketsDisconnected: dced });
});

// FIXED: Unban with multiple matching strategies
app.delete('/admin/ban-device/:deviceId', verifyAdminKey, (req, res) => {
  let { deviceId } = req.params;
  try { deviceId = decodeURIComponent(deviceId); } catch (e) {}
  console.log(`🔓 Unban request: "${deviceId}"`);
  
  // Exact match
  if (bannedDevices.has(deviceId)) {
    bannedDevices.delete(deviceId); userReportCount.delete(deviceId); userHighPriorityReportCount.delete(deviceId);
    console.log(`✅ Unbanned (exact): ${deviceId.substring(0, 12)}...`);
    return res.json({ success: true, message: 'Device unbanned' });
  }
  // Case-insensitive
  for (const [fullId] of bannedDevices.entries()) {
    if (fullId.toLowerCase() === deviceId.toLowerCase()) {
      bannedDevices.delete(fullId); userReportCount.delete(fullId); userHighPriorityReportCount.delete(fullId);
      console.log(`✅ Unbanned (case): ${fullId.substring(0, 12)}...`);
      return res.json({ success: true, message: 'Device unbanned' });
    }
  }
  // Partial match
  for (const [fullId] of bannedDevices.entries()) {
    if (fullId.includes(deviceId) || deviceId.includes(fullId)) {
      bannedDevices.delete(fullId); userReportCount.delete(fullId); userHighPriorityReportCount.delete(fullId);
      console.log(`✅ Unbanned (partial): ${fullId.substring(0, 12)}...`);
      return res.json({ success: true, message: 'Device unbanned', matchedId: fullId.substring(0, 20) + '...' });
    }
  }
  // Starts-with match (for truncated IDs with ...)
  const cleanId = deviceId.replace(/\.\.\.$/, '').replace(/[^A-Za-z0-9\-]/g, '');
  for (const [fullId] of bannedDevices.entries()) {
    if (fullId.startsWith(cleanId)) {
      bannedDevices.delete(fullId); userReportCount.delete(fullId); userHighPriorityReportCount.delete(fullId);
      console.log(`✅ Unbanned (starts-with): ${fullId.substring(0, 12)}...`);
      return res.json({ success: true, message: 'Device unbanned', matchedId: fullId.substring(0, 20) + '...' });
    }
  }
  console.log(`❌ Not found: "${deviceId}"`);
  res.status(404).json({ error: 'Device is not banned', requestedId: deviceId, bannedCount: bannedDevices.size });
});

// FIXED: Banned devices list returns FULL IDs
app.get('/admin/banned-devices', verifyAdminKey, (_req, res) => {
  const list = [], now = Date.now();
  for (const [deviceId, info] of bannedDevices.entries()) {
    if (info.expiresAt && now > info.expiresAt) { bannedDevices.delete(deviceId); continue; }
    list.push({ deviceId: deviceId, reason: info.reason, timestamp: info.timestamp, expiresAt: info.expiresAt || null, permanent: info.permanent || false, isHighPriority: info.isHighPriority || false, source: info.source || 'manual', reportCount: info.reportIds?.length || 0 });
  }
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ bannedDevices: list, total: list.length });
});

// ─── Admin Stats ────────────────────────────────────────────────────────────
app.get('/admin/stats', verifyAdminKey, (_req, res) => {
  for (const [deviceId, info] of bannedDevices.entries()) { if (info.expiresAt && Date.now() > info.expiresAt) bannedDevices.delete(deviceId); }
  res.json({ activeConnections: io.engine.clientsCount, totalOreyIds: oreyIds.size, activeRooms: rooms.size, queueLength: randomQueue.length, totalNotifications: notifications.length, bannedDevices: bannedDevices.size, totalReports: reports.size, pendingReports: [...reports.values()].filter(r => r.status === 'pending').length, autoBannedCount: [...reports.values()].filter(r => r.status === 'auto_banned').length, highPriorityReports: [...reports.values()].filter(r => r.isHighPriority).length, uptime: process.uptime(), memoryMB: process.memoryUsage().heapUsed / 1024 / 1024 });
});

// ─── Admin Panel & Static ───────────────────────────────────────────────────
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('/admin.html', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) return res.status(404).json({ error: 'Not found' });
    if (req.path === '/admin' || req.path === '/admin.html') return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// ─── Socket.IO ──────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id} (Total: ${io.engine.clientsCount})`);
  socket.emit('video-quality-config', { quality: appConfig.videoQuality, servers: ICE_SERVERS });
  if (appConfig.maintenance.enabled) socket.emit('maintenance-mode', appConfig.maintenance);

  socket.on('register-device', ({ deviceId }) => {
    if (!deviceId) { socket.emit('device-error', { error: 'Device ID required' }); return; }
    const bi = isDeviceBanned(deviceId);
    if (bi) { socket.emit('device-banned', bi); socket.disconnect(true); return; }
    socket.data.deviceId = deviceId;
    socket.emit('device-registered', { deviceId, timestamp: new Date().toISOString() });
  });

  socket.on('report-user', ({ reportedDeviceId, reportedUserId, reason, description }) => {
    const reporterDeviceId = socket.data.deviceId;
    if (!reporterDeviceId) { socket.emit('report-error', { error: 'Device not registered' }); return; }
    if (!reportedDeviceId || !reason) { socket.emit('report-error', { error: 'reportedDeviceId and reason required' }); return; }
    if (reporterDeviceId === reportedDeviceId) { socket.emit('report-error', { error: 'Cannot report yourself' }); return; }
    const rbr = reporterHistory.get(reporterDeviceId) || new Set();
    if (rbr.has(reportedDeviceId)) { socket.emit('report-error', { error: 'Already reported' }); return; }
    const reportId = generateRoomId(), isHP = HIGH_PRIORITY_REASONS.includes(reason);
    const report = { id: reportId, reporterDeviceId, reportedDeviceId, reportedUserId: reportedUserId || null, reason, description: description || '', evidence: null, timestamp: new Date().toISOString(), status: 'pending', reviewedBy: null, reviewNotes: '', reviewedAt: null, autoBanned: false, isHighPriority: isHP };
    reports.set(reportId, report); rbr.add(reportedDeviceId); reporterHistory.set(reporterDeviceId, rbr);
    const cc = (userReportCount.get(reportedDeviceId) || 0) + 1; userReportCount.set(reportedDeviceId, cc);
    if (isHP) { const hc = (userHighPriorityReportCount.get(reportedDeviceId) || 0) + 1; userHighPriorityReportCount.set(reportedDeviceId, hc); }
    let ab = false; const hpc = userHighPriorityReportCount.get(reportedDeviceId) || 0;
    if ((isHP && hpc >= 2) || cc >= AUTO_BAN_THRESHOLD) {
      const bd = isHP ? 0 : DEFAULT_BAN_DURATION_HOURS;
      const bi = { reason: isHP ? `Auto-banned (HP): ${hpc} reports for "${reason}"` : `Auto-banned: ${cc} reports | ${reason}`, timestamp: new Date().toISOString(), expiresAt: bd > 0 ? Date.now() + (bd * 3600000) : null, durationHours: bd > 0 ? bd : null, permanent: bd === 0, source: 'auto', isHighPriority: isHP, reportIds: [] };
      for (const [rid, r] of reports.entries()) { if (r.reportedDeviceId === reportedDeviceId) { bi.reportIds.push(rid); r.status = 'auto_banned'; r.autoBanned = true; } }
      report.status = 'auto_banned'; report.autoBanned = true;
      banDeviceAndDisconnect(reportedDeviceId, bi); ab = true;
    }
    socket.emit('report-submitted', { success: true, reportId, reportCount: cc, isHighPriority: isHP, autoBanned: ab });
  });

  socket.on('register-orey-id', ({ oreyId, userName }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(oreyId);
    if (!entry) { socket.emit('orey-id-invalid'); return; }
    if (entry.expiresAt < Date.now()) { oreyIds.delete(oreyId); socket.emit('orey-id-expired'); return; }
    entry.socketId = socket.id; entry.userName = userName || 'Anonymous';
    socket.data.oreyId = oreyId; socket.data.userName = userName || 'Anonymous';
    socket.emit('orey-id-registered', { oreyId, expiresAt: entry.expiresAt });
  });

  socket.on('connect-by-orey-id', ({ targetOreyId }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(targetOreyId);
    if (!entry) { socket.emit('orey-id-not-found'); return; }
    if (entry.expiresAt < Date.now()) { oreyIds.delete(targetOreyId); socket.emit('orey-id-expired'); return; }
    if (!entry.socketId) { socket.emit('orey-id-offline'); return; }
    const ts = io.sockets.sockets.get(entry.socketId);
    if (!ts) { entry.socketId = null; socket.emit('orey-id-offline'); return; }
    const roomId = generateRoomId(); rooms.set(roomId, new Map());
    socket.join(roomId); ts.join(roomId);
    const cd = { userName: socket.data.userName || 'Anonymous', oreyId: socket.data.oreyId || null, deviceId: socket.data.deviceId || null };
    const calleeD = { userName: entry.userName, oreyId: targetOreyId, deviceId: ts.data.deviceId || null };
    rooms.get(roomId).set(socket.id, cd); rooms.get(roomId).set(entry.socketId, calleeD);
    const rd = { roomId, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS };
    socket.emit('room-joined', { ...rd, peers: [{ socketId: entry.socketId, ...calleeD }] });
    ts.emit('room-joined', { ...rd, peers: [{ socketId: socket.id, ...cd }] });
    ts.emit('incoming-call', { fromName: cd.userName, fromOreyId: cd.oreyId });
  });

  socket.on('join-random', () => { cancelAutoSearch(socket.id); removeFromQueue(socket.id); randomQueue.push(socket.id); socket.emit('waiting-for-match'); attemptMatch(socket.id); });
  socket.on('cancel-random', () => { removeFromQueue(socket.id); cancelAutoSearch(socket.id); socket.emit('random-cancelled'); });
  
  socket.on('join-room', ({ roomId, userName }) => {
    socket.data.userName = userName || 'Anonymous';
    const room = rooms.get(roomId); if (!room) rooms.set(roomId, new Map());
    const r = rooms.get(roomId);
    if (r.size >= 2) { socket.emit('room-full'); return; }
    socket.join(roomId);
    r.set(socket.id, { userName: socket.data.userName, oreyId: socket.data.oreyId || null, deviceId: socket.data.deviceId || null });
    const peers = [...r.entries()].filter(([id]) => id !== socket.id).map(([socketId, data]) => ({ socketId, ...data }));
    socket.emit('room-joined', { roomId, peers, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS });
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName: socket.data.userName });
  });

  socket.on('offer', ({ targetId, offer }) => io.to(targetId).emit('offer', { offer, fromId: socket.id, fromName: socket.data.userName }));
  socket.on('answer', ({ targetId, answer }) => io.to(targetId).emit('answer', { answer, fromId: socket.id }));
  socket.on('ice-candidate', ({ targetId, candidate }) => io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id }));
  socket.on('media-state', ({ roomId, audioEnabled, videoEnabled }) => socket.to(roomId).emit('peer-media-state', { socketId: socket.id, audioEnabled, videoEnabled }));
  
  socket.on('skip', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      [...room.keys()].filter(id => id !== socket.id).forEach(pid => {
        const ps = io.sockets.sockets.get(pid); if (ps) { room.delete(pid); ps.leave(roomId); ps.emit('partner-left', { socketId: socket.id, userName: socket.data.userName, reason: 'skip' }); scheduleAutoSearch(ps); }
      });
      room.delete(socket.id); socket.leave(roomId); if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('skip-confirmed'); removeFromQueue(socket.id); randomQueue.push(socket.id); socket.emit('waiting-for-match'); attemptMatch(socket.id);
  });

  socket.on('leave-chat', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      [...room.keys()].filter(id => id !== socket.id).forEach(pid => { const ps = io.sockets.sockets.get(pid); if (ps) { ps.emit('partner-left', { socketId: socket.id, userName: socket.data.userName, reason: 'left' }); scheduleAutoSearch(ps); } });
      room.delete(socket.id); socket.leave(roomId); if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('left-chat-confirmed');
  });

  socket.on('cancel-auto-search', () => { cancelAutoSearch(socket.id); socket.emit('auto-search-cancelled'); });
  
  socket.on('share-id-request', ({ roomId }) => {
    const room = rooms.get(roomId); if (!room) return;
    [...room.keys()].filter(id => id !== socket.id).forEach(pid => io.to(pid).emit('share-id-request', { fromId: socket.id, fromName: socket.data.userName }));
  });
  
  socket.on('share-id-accept', ({ roomId, targetId }) => {
    const myId = socket.data.oreyId || null; io.to(targetId).emit('share-id-reveal', { oreyId: myId, userName: socket.data.userName });
    const ts = io.sockets.sockets.get(targetId); if (ts) socket.emit('share-id-reveal', { oreyId: ts.data.oreyId || null, userName: ts.data.userName });
  });
  
  socket.on('share-id-decline', ({ roomId }) => {
    const room = rooms.get(roomId); if (!room) return;
    [...room.keys()].filter(id => id !== socket.id).forEach(pid => io.to(pid).emit('share-id-declined'));
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    removeFromQueue(socket.id); cancelAutoSearch(socket.id);
    if (socket.data.oreyId) { const entry = oreyIds.get(socket.data.oreyId); if (entry && entry.socketId === socket.id) entry.socketId = null; }
    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) { const ps = io.sockets.sockets.get(pid); if (ps) { ps.emit('partner-left', { socketId: socket.id, userName: socket.data.userName, reason: 'disconnect' }); scheduleAutoSearch(ps); } }
      if (peers.size === 0) rooms.delete(roomId);
    }
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Orey Server Running');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...`);
  console.log(`🛡️ Admin Key: ${ADMIN_KEY.substring(0, 8)}...`);
  console.log(`🖥️ Admin: http://localhost:${PORT}/admin`);
  console.log(`🚫 Auto-Ban: ${AUTO_BAN_THRESHOLD} reports`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
