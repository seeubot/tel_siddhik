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

// Trust the first proxy (Koyeb load balancer) so express-rate-limit
// can correctly identify clients via X-Forwarded-For
app.set('trust proxy', 1);

// ─── Security Middleware ────────────────────────────────────────────────────
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

// ─── Socket.IO Setup ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Configuration ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const OREY_ID_TTL_MS = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS = 5000;

const API_KEY = process.env.API_KEY || 'oryx_2024_secure_key_change_this';
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin_secret_change_this';

// ─── Ban System Configuration ─────────────────────────────────────────────────
const AUTO_BAN_THRESHOLD = 3;        // Number of reports needed for auto-ban
const DEFAULT_BAN_DURATION_HOURS = 720; // 30 days default ban

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

// ─── In-Memory State ────────────────────────────────────────────────────────
const oreyIds = new Map();
const rooms = new Map();
const randomQueue = [];
const autoSearchTimers = new Map();

// ─── NEW: Report & Ban State ──────────────────────────────────────────────────
const bannedDevices = new Map();      // deviceId -> banInfo
const reports = new Map();            // reportId -> reportInfo
const userReportCount = new Map();    // deviceId -> number of reports received
const reporterHistory = new Map();    // reporterId -> Set of reportedIds (prevent duplicate reports)

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
    isRead: false,
    expiresIn: 30
  },
  {
    id: 2,
    title: "📹 HD Video Available!",
    message: "Update your app to enjoy HD video quality calls with better clarity.",
    type: "feature",
    priority: "high",
    timestamp: new Date().toISOString(),
    actionUrl: "/settings/quality",
    icon: "📹",
    isRead: false,
    expiresIn: 14
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
    whatsNew: [
      "HD Video quality support",
      "Push notifications",
      "Improved connection stability",
      "Bug fixes"
    ],
    forceUpdateMinVersion: 1,
    downloadUrl: "https://play.google.com/store/apps/details?id=com.orey.app",
    changelog: "https://orey.app/changelog"
  },
  maintenance: {
    enabled: false,
    message: "We're improving Orey. Back soon!"
  },
  videoQuality: {
    default: "medium",
    autoAdjust: true,
    maxBitrate: 1500000
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOreyId() {
  return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
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
  if (timer) {
    clearTimeout(timer);
    autoSearchTimers.delete(socketId);
  }
}

function attemptMatch(newSocketId) {
  if (randomQueue.length < 2) return;

  const idxSelf = randomQueue.indexOf(newSocketId);
  if (idxSelf === -1) return;

  let partnerIdx = -1;
  for (let i = 0; i < randomQueue.length; i++) {
    if (i !== idxSelf) { partnerIdx = i; break; }
  }
  if (partnerIdx === -1) return;

  const [selfId, partnerId] = [randomQueue[idxSelf], randomQueue[partnerIdx]];
  const highIdx = Math.max(idxSelf, partnerIdx);
  const lowIdx = Math.min(idxSelf, partnerIdx);
  randomQueue.splice(highIdx, 1);
  randomQueue.splice(lowIdx, 1);

  const roomId = generateRoomId();
  rooms.set(roomId, new Map());

  const selfSocket = io.sockets.sockets.get(selfId);
  const partnerSocket = io.sockets.sockets.get(partnerId);

  if (!selfSocket || !partnerSocket) return;

  selfSocket.join(roomId);
  partnerSocket.join(roomId);

  const selfData = { 
    userName: selfSocket.data.userName || 'Anonymous', 
    oreyId: selfSocket.data.oreyId || null,
    deviceId: selfSocket.data.deviceId || null      // NEW: Include device ID
  };
  const partnerData = { 
    userName: partnerSocket.data.userName || 'Anonymous', 
    oreyId: partnerSocket.data.oreyId || null,
    deviceId: partnerSocket.data.deviceId || null    // NEW: Include device ID
  };

  rooms.get(roomId).set(selfId, selfData);
  rooms.get(roomId).set(partnerId, partnerData);

  const qualityConfig = appConfig.videoQuality;
  const roomData = { 
    roomId, 
    videoQuality: qualityConfig,
    iceServers: ICE_SERVERS,
    autoMatched: true 
  };

  selfSocket.emit('room-joined', { 
    ...roomData,
    peers: [{ socketId: partnerId, ...partnerData }]
  });
  partnerSocket.emit('room-joined', { 
    ...roomData,
    peers: [{ socketId: selfId, ...selfData }]
  });

  selfSocket.emit('incoming-call', { 
    fromName: partnerData.userName, 
    fromOreyId: partnerData.oreyId, 
    autoMatched: true 
  });
  partnerSocket.emit('incoming-call', { 
    fromName: selfData.userName, 
    fromOreyId: selfData.oreyId, 
    autoMatched: true 
  });
}

// ─── NEW: Ban/Report Helpers ──────────────────────────────────────────────────

/**
 * Check if a device is currently banned
 * Returns banInfo if banned, null if not
 */
function isDeviceBanned(deviceId) {
  if (!deviceId) return null;
  
  const banInfo = bannedDevices.get(deviceId);
  if (!banInfo) return null;
  
  // Check if temporary ban has expired
  if (banInfo.expiresAt && Date.now() > banInfo.expiresAt) {
    bannedDevices.delete(deviceId);
    console.log(`✅ Ban expired for device: ${deviceId.substring(0, 12)}...`);
    return null;
  }
  
  return banInfo;
}

/**
 * Apply ban to a device and disconnect all their sockets
 */
function banDeviceAndDisconnect(deviceId, banInfo) {
  bannedDevices.set(deviceId, banInfo);
  
  // Disconnect all sockets belonging to this device
  const socketsToDisconnect = [];
  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket.data.deviceId === deviceId) {
      socketsToDisconnect.push(socketId);
    }
  }
  
  for (const socketId of socketsToDisconnect) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit('device-banned', banInfo);
      socket.disconnect(true);
    }
  }
  
  console.log(`🚫 Banned device: ${deviceId.substring(0, 12)}... - ${socketsToDisconnect.length} sockets disconnected`);
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

// ─── Public REST Endpoints ──────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeConnections: io.engine.clientsCount,
    bannedDevices: bannedDevices.size,       // NEW
    totalReports: reports.size,              // NEW
    memory: process.memoryUsage().heapUsed / 1024 / 1024
  });
});

app.get('/generate-orey-id', (_req, res) => {
  cleanExpiredOreyIds();
  const oreyId = generateOreyId();
  const expiresAt = Date.now() + OREY_ID_TTL_MS;
  oreyIds.set(oreyId, { expiresAt, socketId: null, userName: '' });
  res.json({ oreyId, expiresAt });
});

app.get('/create-room', (_req, res) => {
  const roomId = generateRoomId();
  res.json({ roomId });
});

app.get('/api/get-key-hash', (_req, res) => {
  const hash = crypto.createHash('sha256').update(API_KEY).digest('hex');
  res.json({ hash: hash.substring(0, 32) });
});

// ─── App API Endpoints (Require API Key) ────────────────────────────────────

app.get('/api/version', (req, res) => {
  const platform = req.query.platform || 'android';
  const clientVersion = parseInt(req.query.version) || 0;
  
  const platformConfig = appConfig[platform];
  if (!platformConfig) return res.status(400).json({ error: 'Invalid platform' });
  
  if (clientVersion < platformConfig.versionCode) {
    res.json({ updateAvailable: true, ...platformConfig });
  } else {
    res.json({ updateAvailable: false, currentVersion: platformConfig.versionName });
  }
});

app.get('/api/notifications', (req, res) => {
  const lastId = parseInt(req.query.after_id) || 0;
  
  let filtered = notifications.filter(n => n.id > lastId);
  
  const now = new Date();
  filtered = filtered.filter(n => {
    if (n.expiresIn) {
      const expiry = new Date(n.timestamp);
      expiry.setDate(expiry.getDate() + n.expiresIn);
      return now <= expiry;
    }
    return true;
  });
  
  res.json({
    notifications: filtered,
    total: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    lastSync: new Date().toISOString()
  });
});

app.get('/api/config', (req, res) => {
  const clientVersion = parseInt(req.query.version) || 0;
  
  res.json({
    features: {
      videoCall: true,
      hdVideo: clientVersion >= 2,
      groupCall: false,
      screenShare: clientVersion >= 3
    },
    videoQuality: appConfig.videoQuality,
    iceServers: ICE_SERVERS,
    urls: {
      mainApp: process.env.MAIN_APP_URL || "https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/",
      help: "https://orey.app/help"
    },
    maintenance: appConfig.maintenance
  });
});

// ─── NEW: Device & Report API Endpoints ──────────────────────────────────────

/**
 * POST /api/device/register
 * Register a device ID with the server
 * Body: { deviceId: string, platform?: string }
 */
app.post('/api/device/register', verifyApiKey, (req, res) => {
  const { deviceId, platform } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }
  
  // Check if device is banned
  const banInfo = isDeviceBanned(deviceId);
  if (banInfo) {
    return res.status(403).json({
      error: 'Device is banned',
      banned: true,
      reason: banInfo.reason,
      timestamp: banInfo.timestamp,
      expiresAt: banInfo.expiresAt || null,
      durationHours: banInfo.durationHours || null,
      permanent: !banInfo.expiresAt
    });
  }
  
  console.log(`📱 Device registered: ${deviceId.substring(0, 12)}... (${platform || 'unknown'})`);
  
  res.json({
    success: true,
    deviceId,
    registered: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/device/check-ban
 * Check if a device is banned
 * Body: { deviceId: string }
 */
app.post('/api/device/check-ban', verifyApiKey, (req, res) => {
  const { deviceId } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }
  
  const banInfo = isDeviceBanned(deviceId);
  
  if (banInfo) {
    return res.status(403).json({
      banned: true,
      ...banInfo
    });
  }
  
  res.json({ banned: false });
});

/**
 * POST /api/report
 * Report a user for misbehavior
 * Body: { reporterDeviceId, reportedDeviceId, reportedUserId?, reason, description?, evidence? }
 */
app.post('/api/report', verifyApiKey, (req, res) => {
  const { 
    reporterDeviceId,    // Device ID of person filing report
    reportedDeviceId,    // Device ID of person being reported
    reportedUserId,      // Optional: Orey ID of person being reported
    reason,              // Reason for report
    description,         // Optional: Additional details
    evidence             // Optional: Evidence (screenshot URL, etc.)
  } = req.body;

  // Validation
  if (!reportedDeviceId || !reason) {
    return res.status(400).json({ 
      error: 'reportedDeviceId and reason are required',
      received: { reportedDeviceId, reason }
    });
  }
  
  if (!reporterDeviceId) {
    return res.status(400).json({ error: 'reporterDeviceId is required' });
  }
  
  // Prevent self-reporting
  if (reporterDeviceId === reportedDeviceId) {
    return res.status(400).json({ error: 'Cannot report yourself' });
  }
  
  // Prevent duplicate reports from same reporter
  const reportedByReporter = reporterHistory.get(reporterDeviceId) || new Set();
  if (reportedByReporter.has(reportedDeviceId)) {
    return res.status(400).json({ 
      error: 'You have already reported this user',
      alreadyReported: true
    });
  }
  
  // Create the report
  const reportId = generateRoomId();
  const report = {
    id: reportId,
    reporterDeviceId,
    reportedDeviceId,
    reportedUserId: reportedUserId || null,
    reason,
    description: description || '',
    evidence: evidence || null,
    timestamp: new Date().toISOString(),
    status: 'pending',
    reviewedBy: null,
    reviewNotes: '',
    reviewedAt: null,
    autoBanned: false
  };

  reports.set(reportId, report);
  
  // Track reporter history
  reportedByReporter.add(reportedDeviceId);
  reporterHistory.set(reporterDeviceId, reportedByReporter);
  
  // Increment report count for the reported user
  const currentCount = (userReportCount.get(reportedDeviceId) || 0) + 1;
  userReportCount.set(reportedDeviceId, currentCount);

  console.log(`🚨 Report #${reportId}: Device ${reportedDeviceId.substring(0, 12)}... reported for "${reason}"`);
  console.log(`   Reporter: ${reporterDeviceId.substring(0, 12)}...`);
  console.log(`   Total reports against this device: ${currentCount}`);

  // Check if auto-ban threshold reached
  let autoBanned = false;
  let banInfo = null;
  
  if (currentCount >= AUTO_BAN_THRESHOLD) {
    banInfo = {
      reason: `Auto-banned: ${currentCount} reports received | Latest: ${reason}`,
      timestamp: new Date().toISOString(),
      expiresAt: Date.now() + (DEFAULT_BAN_DURATION_HOURS * 3600000),
      durationHours: DEFAULT_BAN_DURATION_HOURS,
      source: 'auto',
      reportIds: []
    };
    
    // Collect all report IDs for this device
    for (const [rId, r] of reports.entries()) {
      if (r.reportedDeviceId === reportedDeviceId) {
        banInfo.reportIds.push(rId);
        r.status = 'auto_banned';
        r.autoBanned = true;
      }
    }
    
    report.status = 'auto_banned';
    report.autoBanned = true;
    
    banDeviceAndDisconnect(reportedDeviceId, banInfo);
    autoBanned = true;
    
    console.log(`🤖 AUTO-BANNED: ${reportedDeviceId.substring(0, 12)}... (${currentCount} reports)`);
  }

  res.json({
    success: true,
    reportId,
    reportCount: currentCount,
    autoBanned,
    banInfo: banInfo || null
  });
});

// ─── Admin Endpoints (Require Admin Key) ────────────────────────────────────

app.get('/admin/notifications', verifyAdminKey, (_req, res) => {
  res.json({ 
    notifications, 
    total: notifications.length,
    active: notifications.filter(n => {
      if (n.expiresIn) {
        const expiry = new Date(n.timestamp);
        expiry.setDate(expiry.getDate() + n.expiresIn);
        return new Date() <= expiry;
      }
      return true;
    }).length
  });
});

app.post('/admin/notifications', verifyAdminKey, (req, res) => {
  const { title, message, type, priority, actionUrl, icon, expiresIn } = req.body;
  
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required' });
  }
  
  const newId = notifications.length > 0 
    ? Math.max(...notifications.map(n => n.id)) + 1 
    : 1;
    
  const newNotification = {
    id: newId,
    title,
    message,
    type: type || 'info',
    priority: priority || 'normal',
    timestamp: new Date().toISOString(),
    actionUrl: actionUrl || '/',
    icon: icon || '📢',
    isRead: false,
    expiresIn: expiresIn || 30
  };
  
  notifications.push(newNotification);
  
  io.emit('new-notification', newNotification);
  
  console.log(`📢 Notification sent: "${title}" to ${io.engine.clientsCount} clients`);
  
  res.json({ 
    success: true, 
    notification: newNotification,
    activeClients: io.engine.clientsCount
  });
});

app.delete('/admin/notifications/:id', verifyAdminKey, (req, res) => {
  const id = parseInt(req.params.id);
  const index = notifications.findIndex(n => n.id === id);
  
  if (index === -1) return res.status(404).json({ error: 'Notification not found' });
  
  const deleted = notifications.splice(index, 1)[0];
  res.json({ success: true, deleted });
});

app.put('/api/version', verifyAdminKey, (req, res) => {
  const { platform, versionCode, versionName, updateType, updateMessage, downloadUrl, whatsNew } = req.body;
  
  if (!platform || !versionCode) {
    return res.status(400).json({ error: 'Platform and versionCode required' });
  }
  
  if (!appConfig[platform]) appConfig[platform] = {};
  
  Object.assign(appConfig[platform], { 
    versionCode, 
    versionName: versionName || `v${versionCode}`,
    updateType: updateType || 'flexible',
    updateMessage: updateMessage || 'New update available!',
    downloadUrl: downloadUrl || appConfig[platform].downloadUrl
  });
  
  if (whatsNew) appConfig[platform].whatsNew = whatsNew;
  
  io.emit('update-available', appConfig[platform]);
  
  res.json({ success: true, config: appConfig[platform] });
});

app.post('/admin/maintenance', verifyAdminKey, (req, res) => {
  const { enabled, message } = req.body;
  appConfig.maintenance = { 
    enabled: enabled || false, 
    message: message || '' 
  };
  
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

// ─── NEW: Admin Report Management Endpoints ──────────────────────────────────

/**
 * GET /admin/reports
 * Get all reports (with optional status filter)
 * Query: ?status=pending|reviewed|banned|dismissed|auto_banned
 */
app.get('/admin/reports', verifyAdminKey, (req, res) => {
  const status = req.query.status;
  const allReports = [];
  
  for (const [id, report] of reports.entries()) {
    if (status && report.status !== status) continue;
    allReports.push({ id, ...report });
  }
  
  // Sort by newest first
  allReports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json({
    reports: allReports,
    total: allReports.length,
    pending: [...reports.values()].filter(r => r.status === 'pending').length,
    autoBanned: [...reports.values()].filter(r => r.status === 'auto_banned').length,
    activeBans: bannedDevices.size
  });
});

/**
 * POST /admin/reports/:reportId/action
 * Take action on a specific report
 * Body: { action: 'ban'|'dismiss'|'warn', banDuration?: number, notes?: string }
 */
app.post('/admin/reports/:reportId/action', verifyAdminKey, (req, res) => {
  const { reportId } = req.params;
  const { action, banDuration, notes } = req.body;
  
  const report = reports.get(reportId);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  
  if (report.status !== 'pending') {
    return res.status(400).json({ error: `Report already ${report.status}` });
  }
  
  report.reviewedAt = new Date().toISOString();
  report.reviewNotes = notes || '';
  
  switch (action) {
    case 'ban': {
      const duration = banDuration || DEFAULT_BAN_DURATION_HOURS;
      const banInfo = {
        reason: report.reason,
        description: report.description,
        timestamp: new Date().toISOString(),
        expiresAt: duration > 0 ? Date.now() + (duration * 3600000) : null,
        durationHours: duration > 0 ? duration : null,
        permanent: duration === 0,
        source: 'admin',
        reportIds: [reportId],
        reviewedBy: 'admin',
        reviewNotes: notes || ''
      };
      
      banDeviceAndDisconnect(report.reportedDeviceId, banInfo);
      report.status = 'banned';
      
      console.log(`👨‍⚖️ Admin banned device: ${report.reportedDeviceId.substring(0, 12)}...`);
      break;
    }
    
    case 'dismiss': {
      report.status = 'dismissed';
      console.log(`✅ Report dismissed: ${reportId}`);
      break;
    }
    
    case 'warn': {
      report.status = 'warned';
      // Could send warning notification to user
      for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.data.deviceId === report.reportedDeviceId) {
          socket.emit('warning', {
            reason: report.reason,
            message: 'You have received a warning. Further violations may result in a ban.'
          });
        }
      }
      console.log(`⚠️ Warning sent to device: ${report.reportedDeviceId.substring(0, 12)}...`);
      break;
    }
    
    default:
      return res.status(400).json({ error: 'Invalid action. Use: ban, dismiss, or warn' });
  }
  
  res.json({ success: true, report });
});

// ─── NEW: Admin Ban Management Endpoints ─────────────────────────────────────

/**
 * POST /admin/ban-device
 * Manually ban a device
 * Body: { deviceId, reason, durationHours? }
 */
app.post('/admin/ban-device', verifyAdminKey, (req, res) => {
  const { deviceId, reason, durationHours } = req.body;
  
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }
  
  // Check if already banned
  const existingBan = isDeviceBanned(deviceId);
  if (existingBan) {
    return res.status(400).json({ 
      error: 'Device is already banned',
      existingBan
    });
  }
  
  const banInfo = {
    reason: reason || 'Violation of terms of service',
    timestamp: new Date().toISOString(),
    expiresAt: durationHours ? Date.now() + (durationHours * 3600000) : null,
    durationHours: durationHours || null,
    permanent: !durationHours,
    source: 'manual',
    reviewedBy: 'admin'
  };
  
  const disconnected = banDeviceAndDisconnect(deviceId, banInfo);
  
  console.log(`🚫 Manual ban: ${deviceId.substring(0, 12)}... - ${disconnected} sockets disconnected`);
  
  res.json({ 
    success: true, 
    deviceId: deviceId.substring(0, 12) + '...',
    banInfo,
    socketsDisconnected: disconnected
  });
});

/**
 * DELETE /admin/ban-device/:deviceId
 * Unban a device
 */
app.delete('/admin/ban-device/:deviceId', verifyAdminKey, (req, res) => {
  const { deviceId } = req.params;
  
  if (!bannedDevices.has(deviceId)) {
    return res.status(404).json({ error: 'Device is not banned' });
  }
  
  bannedDevices.delete(deviceId);
  
  // Also clear report count so they start fresh
  userReportCount.delete(deviceId);
  
  console.log(`✅ Device unbanned: ${deviceId.substring(0, 12)}...`);
  
  res.json({ success: true, message: 'Device has been unbanned' });
});

/**
 * GET /admin/banned-devices
 * Get list of all banned devices
 */
app.get('/admin/banned-devices', verifyAdminKey, (_req, res) => {
  const list = [];
  
  for (const [deviceId, info] of bannedDevices.entries()) {
    list.push({
      deviceId: deviceId.substring(0, 12) + '...',
      reason: info.reason,
      timestamp: info.timestamp,
      expiresAt: info.expiresAt || null,
      permanent: !info.expiresAt,
      isExpired: info.expiresAt ? Date.now() > info.expiresAt : false,
      source: info.source || 'manual'
    });
  }
  
  // Clean expired bans
  for (const item of list) {
    if (item.isExpired && item.expiresAt) {
      for (const [deviceId, info] of bannedDevices.entries()) {
        if (info.expiresAt === item.expiresAt) {
          bannedDevices.delete(deviceId);
        }
      }
    }
  }
  
  res.json({ 
    bannedDevices: list.filter(b => !b.isExpired), 
    total: list.filter(b => !b.isExpired).length 
  });
});

// ─── NEW: Admin Stats (Updated) ──────────────────────────────────────────────

app.get('/admin/stats', verifyAdminKey, (_req, res) => {
  // Clean expired bans first
  for (const [deviceId, info] of bannedDevices.entries()) {
    if (info.expiresAt && Date.now() > info.expiresAt) {
      bannedDevices.delete(deviceId);
    }
  }
  
  res.json({
    activeConnections: io.engine.clientsCount,
    totalOreyIds: oreyIds.size,
    activeRooms: rooms.size,
    queueLength: randomQueue.length,
    totalNotifications: notifications.length,
    // Ban stats
    bannedDevices: bannedDevices.size,
    totalReports: reports.size,
    pendingReports: [...reports.values()].filter(r => r.status === 'pending').length,
    autoBannedCount: [...reports.values()].filter(r => r.status === 'auto_banned').length,
    // System
    uptime: process.uptime(),
    memoryMB: process.memoryUsage().heapUsed / 1024 / 1024
  });
});

// ─── Admin Panel Routes (NO AUTH REQUIRED for the page itself) ────────────────

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/admin.html', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ─── Static Files & SPA ─────────────────────────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    index: false
  }));
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (req.path === '/admin' || req.path === '/admin.html') {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

// ─── Socket.IO Events ───────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id} (Total: ${io.engine.clientsCount})`);

  // Send config on connect
  socket.emit('video-quality-config', {
    quality: appConfig.videoQuality,
    servers: ICE_SERVERS
  });

  // Check for active maintenance
  if (appConfig.maintenance.enabled) {
    socket.emit('maintenance-mode', appConfig.maintenance);
  }

  // ─── NEW: Device Registration Socket Event ──────────────────────────────────
  
  socket.on('register-device', ({ deviceId }) => {
    if (!deviceId) {
      socket.emit('device-error', { error: 'Device ID required' });
      return;
    }
    
    // Check if device is banned
    const banInfo = isDeviceBanned(deviceId);
    if (banInfo) {
      socket.emit('device-banned', banInfo);
      socket.disconnect(true);
      return;
    }
    
    socket.data.deviceId = deviceId;
    console.log(`🔗 Socket ${socket.id} linked to device ${deviceId.substring(0, 12)}...`);
    
    socket.emit('device-registered', { 
      deviceId,
      timestamp: new Date().toISOString()
    });
  });

  // ─── NEW: Report Socket Event (alternative to REST for in-call reporting) ──
  
  socket.on('report-user', ({ reportedDeviceId, reportedUserId, reason, description }) => {
    const reporterDeviceId = socket.data.deviceId;
    
    if (!reporterDeviceId) {
      socket.emit('report-error', { error: 'Your device is not registered' });
      return;
    }
    
    if (!reportedDeviceId || !reason) {
      socket.emit('report-error', { error: 'reportedDeviceId and reason required' });
      return;
    }
    
    // Prevent self-report
    if (reporterDeviceId === reportedDeviceId) {
      socket.emit('report-error', { error: 'Cannot report yourself' });
      return;
    }
    
    // Prevent duplicate reports
    const reportedByReporter = reporterHistory.get(reporterDeviceId) || new Set();
    if (reportedByReporter.has(reportedDeviceId)) {
      socket.emit('report-error', { error: 'Already reported this user' });
      return;
    }
    
    const reportId = generateRoomId();
    const report = {
      id: reportId,
      reporterDeviceId,
      reportedDeviceId,
      reportedUserId: reportedUserId || null,
      reason,
      description: description || '',
      evidence: null,
      timestamp: new Date().toISOString(),
      status: 'pending',
      reviewedBy: null,
      reviewNotes: '',
      reviewedAt: null,
      autoBanned: false
    };

    reports.set(reportId, report);
    
    reportedByReporter.add(reportedDeviceId);
    reporterHistory.set(reporterDeviceId, reportedByReporter);
    
    const currentCount = (userReportCount.get(reportedDeviceId) || 0) + 1;
    userReportCount.set(reportedDeviceId, currentCount);

    console.log(`🚨 Socket Report #${reportId}: ${reportedDeviceId.substring(0, 12)}... for "${reason}"`);

    // Auto-ban check
    let autoBanned = false;
    let banInfo = null;
    
    if (currentCount >= AUTO_BAN_THRESHOLD) {
      banInfo = {
        reason: `Auto-banned: ${currentCount} reports received | Latest: ${reason}`,
        timestamp: new Date().toISOString(),
        expiresAt: Date.now() + (DEFAULT_BAN_DURATION_HOURS * 3600000),
        durationHours: DEFAULT_BAN_DURATION_HOURS,
        source: 'auto',
        reportIds: []
      };
      
      for (const [rId, r] of reports.entries()) {
        if (r.reportedDeviceId === reportedDeviceId) {
          banInfo.reportIds.push(rId);
          r.status = 'auto_banned';
          r.autoBanned = true;
        }
      }
      
      report.status = 'auto_banned';
      report.autoBanned = true;
      
      banDeviceAndDisconnect(reportedDeviceId, banInfo);
      autoBanned = true;
    }
    
    socket.emit('report-submitted', {
      success: true,
      reportId,
      reportCount: currentCount,
      autoBanned
    });
  });

  // ─── Existing Socket Events ─────────────────────────────────────────────────

  socket.on('register-orey-id', ({ oreyId, userName }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(oreyId);
    if (!entry) {
      socket.emit('orey-id-invalid');
      return;
    }
    if (entry.expiresAt < Date.now()) {
      oreyIds.delete(oreyId);
      socket.emit('orey-id-expired');
      return;
    }
    entry.socketId = socket.id;
    entry.userName = userName || 'Anonymous';
    socket.data.oreyId = oreyId;
    socket.data.userName = userName || 'Anonymous';
    socket.emit('orey-id-registered', { oreyId, expiresAt: entry.expiresAt });
  });

  socket.on('connect-by-orey-id', ({ targetOreyId }) => {
    cleanExpiredOreyIds();
    const entry = oreyIds.get(targetOreyId);
    if (!entry) {
      socket.emit('orey-id-not-found');
      return;
    }
    if (entry.expiresAt < Date.now()) {
      oreyIds.delete(targetOreyId);
      socket.emit('orey-id-expired');
      return;
    }
    if (!entry.socketId) {
      socket.emit('orey-id-offline');
      return;
    }

    const targetSocket = io.sockets.sockets.get(entry.socketId);
    if (!targetSocket) {
      entry.socketId = null;
      socket.emit('orey-id-offline');
      return;
    }

    const roomId = generateRoomId();
    rooms.set(roomId, new Map());

    socket.join(roomId);
    targetSocket.join(roomId);

    const callerData = { 
      userName: socket.data.userName || 'Anonymous', 
      oreyId: socket.data.oreyId || null,
      deviceId: socket.data.deviceId || null      // NEW
    };
    const calleeData = { 
      userName: entry.userName, 
      oreyId: targetOreyId,
      deviceId: targetSocket.data.deviceId || null  // NEW
    };

    rooms.get(roomId).set(socket.id, callerData);
    rooms.get(roomId).set(entry.socketId, calleeData);

    const roomData = { 
      roomId, 
      videoQuality: appConfig.videoQuality,
      iceServers: ICE_SERVERS 
    };

    socket.emit('room-joined', { ...roomData, peers: [{ socketId: entry.socketId, ...calleeData }] });
    targetSocket.emit('room-joined', { ...roomData, peers: [{ socketId: socket.id, ...callerData }] });
    targetSocket.emit('incoming-call', { fromName: callerData.userName, fromOreyId: callerData.oreyId });
  });

  // ... (All remaining existing socket events stay exactly the same) ...
  
  socket.on('join-random', () => {
    cancelAutoSearch(socket.id);
    removeFromQueue(socket.id);
    randomQueue.push(socket.id);
    socket.emit('waiting-for-match');
    attemptMatch(socket.id);
  });

  socket.on('cancel-random', () => {
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);
    socket.emit('random-cancelled');
  });

  socket.on('join-room', ({ roomId, userName }) => {
    socket.data.userName = userName || 'Anonymous';
    const room = rooms.get(roomId);
    if (!room) rooms.set(roomId, new Map());
    const r = rooms.get(roomId);
    if (r.size >= 2) {
      socket.emit('room-full');
      return;
    }
    socket.join(roomId);
    r.set(socket.id, { 
      userName: socket.data.userName, 
      oreyId: socket.data.oreyId || null,
      deviceId: socket.data.deviceId || null      // NEW
    });
    const peers = [...r.entries()]
      .filter(([id]) => id !== socket.id)
      .map(([socketId, data]) => ({ socketId, ...data }));
    
    socket.emit('room-joined', { 
      roomId, 
      peers,
      videoQuality: appConfig.videoQuality,
      iceServers: ICE_SERVERS
    });
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName: socket.data.userName });
  });

  socket.on('request-quality-change', ({ roomId, quality }) => {
    if (VIDEO_QUALITY[quality]) {
      socket.to(roomId).emit('quality-change-requested', { 
        fromId: socket.id, 
        quality, 
        config: VIDEO_QUALITY[quality] 
      });
    }
  });

  socket.on('accept-quality-change', ({ roomId, quality }) => {
    if (VIDEO_QUALITY[quality]) {
      socket.to(roomId).emit('quality-change-accepted', { 
        quality, 
        config: VIDEO_QUALITY[quality] 
      });
    }
  });

  socket.on('offer', ({ targetId, offer }) => {
    io.to(targetId).emit('offer', { offer, fromId: socket.id, fromName: socket.data.userName });
  });

  socket.on('answer', ({ targetId, answer }) => {
    io.to(targetId).emit('answer', { answer, fromId: socket.id });
  });

  socket.on('ice-candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('ice-candidate', { candidate, fromId: socket.id });
  });

  socket.on('media-state', ({ roomId, audioEnabled, videoEnabled }) => {
    socket.to(roomId).emit('peer-media-state', { 
      socketId: socket.id, 
      audioEnabled, 
      videoEnabled 
    });
  });

  socket.on('skip', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const partnerIds = [...room.keys()].filter(id => id !== socket.id);
      partnerIds.forEach(pid => {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          room.delete(pid);
          partnerSocket.leave(roomId);
          partnerSocket.emit('partner-left', { 
            socketId: socket.id, 
            userName: socket.data.userName, 
            reason: 'skip' 
          });
          scheduleAutoSearch(partnerSocket);
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
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
      const partnerIds = [...room.keys()].filter(id => id !== socket.id);
      partnerIds.forEach(pid => {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          partnerSocket.emit('partner-left', { 
            socketId: socket.id, 
            userName: socket.data.userName, 
            reason: 'left' 
          });
          scheduleAutoSearch(partnerSocket);
        }
      });
      room.delete(socket.id);
      socket.leave(roomId);
      if (room.size === 0) rooms.delete(roomId);
    }
    socket.emit('left-chat-confirmed');
  });

  socket.on('cancel-auto-search', () => {
    cancelAutoSearch(socket.id);
    socket.emit('auto-search-cancelled');
  });

  socket.on('share-id-request', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const partnerIds = [...room.keys()].filter(id => id !== socket.id);
    partnerIds.forEach(pid => {
      io.to(pid).emit('share-id-request', { 
        fromId: socket.id, 
        fromName: socket.data.userName 
      });
    });
  });

  socket.on('share-id-accept', ({ roomId, targetId }) => {
    const myOreyId = socket.data.oreyId || null;
    io.to(targetId).emit('share-id-reveal', { 
      oreyId: myOreyId, 
      userName: socket.data.userName 
    });
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      socket.emit('share-id-reveal', { 
        oreyId: targetSocket.data.oreyId || null, 
        userName: targetSocket.data.userName 
      });
    }
  });

  socket.on('share-id-decline', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const partnerIds = [...room.keys()].filter(id => id !== socket.id);
    partnerIds.forEach(pid => {
      io.to(pid).emit('share-id-declined');
    });
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id} (Total: ${io.engine.clientsCount})`);
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);

    if (socket.data.oreyId) {
      const entry = oreyIds.get(socket.data.oreyId);
      if (entry && entry.socketId === socket.id) {
        entry.socketId = null;
      }
    }

    const result = removeSocketFromRooms(socket.id);
    if (result) {
      const { roomId, peers } = result;
      for (const [pid] of peers.entries()) {
        const partnerSocket = io.sockets.sockets.get(pid);
        if (partnerSocket) {
          partnerSocket.emit('partner-left', { 
            socketId: socket.id, 
            userName: socket.data.userName, 
            reason: 'disconnect' 
          });
          scheduleAutoSearch(partnerSocket);
        }
      }
      if (peers.size === 0) rooms.delete(roomId);
    }
  });
});

// ─── Start Server ────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Orey Server Running');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 URL:            http://localhost:${PORT}`);
  console.log(`👥 Socket.IO:      Active`);
  console.log(`📹 Quality:        ${Object.keys(VIDEO_QUALITY).join(', ')}`);
  console.log(`🔑 API Key:        ${API_KEY.substring(0, 8)}...`);
  console.log(`🛡️ Admin Key:      ${ADMIN_KEY.substring(0, 8)}...`);
  console.log(`🖥️  Admin Page:     http://localhost:${PORT}/admin`);
  console.log(`🚫 Auto-Ban After: ${AUTO_BAN_THRESHOLD} reports`);
  console.log(`⏰ Ban Duration:   ${DEFAULT_BAN_DURATION_HOURS}h (${DEFAULT_BAN_DURATION_HOURS/24} days)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
