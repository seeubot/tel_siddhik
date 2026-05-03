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

const createGenderMatcher = require('./gender');

const app    = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json());

const PORT                       = process.env.PORT                       || 3000;
const MONGO_URI                  = process.env.MONGO_URI                  || 'mongodb+srv://naya:naya@naya.fk9em5f.mongodb.net/?appName=naya';
const OREY_ID_TTL_MS             = 24 * 60 * 60 * 1000;
const AUTO_SEARCH_DELAY_MS       = 5000;
const API_KEY                    = process.env.API_KEY                    || 'oryx_2024_secure_key_change_this';
const ADMIN_KEY                  = process.env.ADMIN_KEY                  || 'admin_secret_change_this';
const AUTO_BAN_THRESHOLD         = 3;
const HIGH_PRIORITY_BAN_THRESHOLD = 2;
const DEFAULT_BAN_DURATION_HOURS = 720;
const SESSION_DURATION_MS        = 2 * 60 * 60 * 1000;
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

const ReportSchema = new mongoose.Schema({
  id:               { type: String, required: true, unique: true, index: true },
  reporterDeviceId: String, reportedDeviceId: { type: String, index: true },
  reportedUserId:   String, reason: String, description: String, evidence: String,
  timestamp:        { type: Date, default: Date.now },
  status:           { type: String, default: 'pending', index: true },
  reviewedBy:       String, reviewNotes: String, reviewedAt: Date,
  autoBanned:       { type: Boolean, default: false },
  isHighPriority:   { type: Boolean, default: false },
});
const Report = mongoose.model('Report', ReportSchema);

const NotificationSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  title: String, message: String, type: { type: String, default: 'info' },
  priority: { type: String, default: 'normal' },
  targetPlatform: { type: String, default: 'all' },
  targetDeviceIds:{ type: [String], default: [] },
  timestamp: { type: Date, default: Date.now },
  actionUrl: { type: String, default: '/' }, icon: { type: String, default: '📢' },
  imageUrl: String, isRead: { type: Boolean, default: false },
  readAt: Date, readBy: String, expiresIn: { type: Number, default: 30 },
});
const Notification = mongoose.model('Notification', NotificationSchema);

const AppConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' }, android: Object,
  maintenance: Object, videoQuality: Object, safety: Object,
});
const AppConfigModel = mongoose.model('AppConfig', AppConfigSchema);

const ReportCountSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true, index: true },
  total: { type: Number, default: 0 }, highPriority: { type: Number, default: 0 },
  reportedBy: { type: [String], default: [] },
});
const ReportCount = mongoose.model('ReportCount', ReportCountSchema);

const OreyIdSchema = new mongoose.Schema({
  hashId: { type: String, required: true, unique: true, index: true },
  displayId: { type: String, required: true, unique: true },
  socketId: { type: String, default: null }, userName: { type: String, default: '' },
  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});
OreyIdSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const OreyIdModel = mongoose.model('OreyId', OreyIdSchema);

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

async function initDB() {
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('✅ MongoDB connected');

  let cfg = await AppConfigModel.findById('main').lean();
  if (!cfg) {
    cfg = {
      _id: 'main', android: { versionCode: 1, versionName: '1.0.0', updateType: 'flexible', updatePriority: 2, updateMessage: 'New features available!', updateTitle: 'Update Available', whatsNew: ['HD Video','Push notifications','Connection stability','Safety features'], forceUpdateMinVersion: 1, downloadUrl: 'https://play.google.com/store/apps/details?id=com.orey.app', changelog: 'https://orey.app/changelog' },
      maintenance: { enabled: false, message: "We're improving Orey. Back soon!" },
      videoQuality: { default: 'medium', autoAdjust: true, maxBitrate: 1500000 },
      safety: { autoBanEnabled: true, autoBanThreshold: AUTO_BAN_THRESHOLD, highPriorityThreshold: HIGH_PRIORITY_BAN_THRESHOLD, reportingEnabled: true, contentModeration: true },
    };
    await AppConfigModel.create(cfg);
  }
  appConfig = cfg;

  const bans = await Ban.find({}).lean();
  for (const b of bans) bannedDevicesCache.set(b.deviceId, b);
  console.log(`📦 Loaded ${bans.length} bans`);

  const notifs = await Notification.find({}).sort({ id: 1 }).lean();
  if (notifs.length === 0) {
    const welcome = { id: 1, title: '🎉 Welcome to Orey!', message: 'Start video calling with friends using Orey-ID.', type: 'info', priority: 'normal', targetPlatform: 'all', targetDeviceIds: [], timestamp: new Date(), actionUrl: '/welcome', icon: '🎉', imageUrl: 'https://i.postimg.cc/cLq03ZZg/IMG-20260428-WA0002.jpg', isRead: false, readAt: null, readBy: null, expiresIn: 30 };
    await Notification.create(welcome);
    notificationsCache = [welcome]; notificationIdCounter = 2;
  } else {
    notificationsCache = notifs.map(n => ({ id: n.id, title: n.title, message: n.message, type: n.type || 'info', priority: n.priority || 'normal', targetPlatform: n.targetPlatform || 'all', targetDeviceIds: n.targetDeviceIds || [], timestamp: n.timestamp, actionUrl: n.actionUrl || '/', icon: n.icon || '📢', imageUrl: n.imageUrl || null, isRead: n.isRead || false, readAt: n.readAt || null, readBy: n.readBy || null, expiresIn: n.expiresIn || 30 }));
    notificationIdCounter = Math.max(...notifs.map(n => n.id), 0) + 1;
  }
  console.log(`📦 Loaded ${notificationsCache.length} notifications`);
  await OreyIdModel.deleteMany({ expiresAt: { $lt: new Date() } });
}

function isBrowserRequest(req) {
  return (req.headers.accept||'').includes('text/html') && !(req.headers['user-agent']||'').includes('OreyApp') && !req.headers['x-api-key'];
}

app.use('/api/', (req, res, next) => {
  if (isBrowserRequest(req)) return res.status(200).type('html').send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+SERVICE_NAME+'</title><style>body{font-family:system-ui;background:#0b0f17;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}.c{text-align:center;background:#1e293b;padding:3rem;border-radius:24px;border:1px solid #334155}h1{color:#3b82f6;font-size:2.5rem}.s{color:#10b981;padding:0.5rem 1rem;border-radius:20px;background:#065f46}</style></head><body><div class="c"><h1>🔷 '+SERVICE_NAME+'</h1><p style="color:#94a3b8">Video Calling Platform</p><span class="s">🟢 Running</span></div></body></html>');
  next();
});

app.use('/admin/', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout') return next();
  if (isBrowserRequest(req) && !req.headers['x-session-token']) return res.redirect('/admin');
  next();
});

const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 100, message: { error: 'Too many requests' } });
app.use('/api/', apiLimiter);
app.use('/admin/', apiLimiter);

const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] }, maxHttpBufferSize: 1e7, pingTimeout: 60000, pingInterval: 25000 });

const genderMatcher = createGenderMatcher(io);

// ═════════════════════════════════════════════════
// 🆕 PATCH 1 — Gender Timer Expiry Callback
// ═════════════════════════════════════════════════
genderMatcher.onTimerExpire((socketId, gender) => {
  const socket = io.sockets.sockets.get(socketId);
  if (!socket) return;

  const alreadyInRoom = [...rooms.values()].some(r => r.has(socketId));
  if (alreadyInRoom) return;

  console.log(`⏰ Timer expired: ${socketId.slice(0,8)} (${gender}) → random queue`);

  if (!randomQueue.includes(socketId)) {
    randomQueue.push(socketId);
  }

  socket.emit('match-stage-changed', { stage: 'open' });
  attemptMatch(socketId);
});

// ═════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════

function generateOreyDisplayId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) suffix += chars[Math.floor(Math.random()*chars.length)];
  return 'OREY-'+suffix;
}

function hashOreyId(displayId) {
  return crypto.createHash('sha256').update(displayId+Date.now().toString()).digest('hex').substring(0,16);
}

function generateRoomId() { return uuidv4().replace(/-/g,'').substring(0,8).toLowerCase(); }
function generateSessionToken() { return crypto.randomBytes(32).toString('hex'); }

function cleanExpiredOreyIds() {
  const now = Date.now();
  for (const [id,data] of oreyIds.entries()) { if (data.expiresAt<now) oreyIds.delete(id); }
}

function removeFromQueue(socketId) { const idx=randomQueue.indexOf(socketId); if(idx!==-1)randomQueue.splice(idx,1); }

function removeSocketFromRooms(socketId) {
  for (const [roomId,peers] of rooms.entries()) {
    if (peers.has(socketId)) { peers.delete(socketId); if(peers.size===0)rooms.delete(roomId); return {roomId,peers}; }
  }
  return null;
}

function scheduleAutoSearch(socket, delay=AUTO_SEARCH_DELAY_MS) {
  cancelAutoSearch(socket.id);
  const timer=setTimeout(()=>{autoSearchTimers.delete(socket.id);randomQueue.push(socket.id);attemptMatch(socket.id);},delay);
  autoSearchTimers.set(socket.id,timer);
  socket.emit('auto-search-scheduled',{delay});
}

function cancelAutoSearch(socketId) {
  const timer=autoSearchTimers.get(socketId);
  if(timer){clearTimeout(timer);autoSearchTimers.delete(socketId);}
}

// ═════════════════════════════════════════════════
// 🆕 PATCH 3 — _createRoom helper
// ═════════════════════════════════════════════════
function _createRoom(selfSocket, partnerSocket) {
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

  rooms.get(roomId).set(selfSocket.id,    selfData);
  rooms.get(roomId).set(partnerSocket.id, partnerData);

  const roomData = { roomId, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS, autoMatched: true };

  selfSocket.emit('room-joined',    { ...roomData, peers: [{ socketId: partnerSocket.id, ...partnerData }] });
  partnerSocket.emit('room-joined', { ...roomData, peers: [{ socketId: selfSocket.id,    ...selfData    }] });
  selfSocket.emit('incoming-call',    { fromName: partnerData.userName, fromOreyId: partnerData.oreyId, partnerGender: partnerData.gender, autoMatched: true });
  partnerSocket.emit('incoming-call', { fromName: selfData.userName,    fromOreyId: selfData.oreyId,    partnerGender: selfData.gender,    autoMatched: true });

  console.log(`🤝 Room: ${roomId} | ${selfSocket.id.slice(0,8)} ↔ ${partnerSocket.id.slice(0,8)} | genders: ${selfData.gender||'none'} / ${partnerData.gender||'none'}`);
}

// ═════════════════════════════════════════════════
// 🆕 PATCH 2 — attemptMatch
// ═════════════════════════════════════════════════
function attemptMatch(newSocketId) {
  const socket = io.sockets.sockets.get(newSocketId);
  if (!socket) return;

  const gender = socket.data.gender || null;

  // Step 1: Gender-aware match
  if (gender && genderMatcher.isQueued(newSocketId)) {
    const result = genderMatcher.findMatch(newSocketId, gender);

    if (result.matched) {
      const partnerSocket = io.sockets.sockets.get(result.partner.socketId);
      if (partnerSocket) {
        genderMatcher.dequeue(newSocketId);
        genderMatcher.dequeue(result.partner.socketId);
        removeFromQueue(newSocketId);
        removeFromQueue(result.partner.socketId);
        _createRoom(socket, partnerSocket);
        return;
      }
      attemptMatch(newSocketId);
      return;
    }

    // No gender match — if timer still active, wait
    if (!genderMatcher.isTimerExpired(newSocketId)) {
      return;
    }
  }

  // Step 2: Random queue fallback
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
    if (candidateSocket) { partnerIdx = i; break; }
    randomQueue.splice(i, 1);
    if (i < idxSelf) idxSelf--;
    i--;
  }

  if (partnerIdx === -1) return;

  const partnerId = randomQueue[partnerIdx];
  const partnerSocket = io.sockets.sockets.get(partnerId);
  if (!partnerSocket) { removeFromQueue(partnerId); attemptMatch(newSocketId); return; }

  const highIdx = Math.max(idxSelf, partnerIdx);
  const lowIdx  = Math.min(idxSelf, partnerIdx);
  randomQueue.splice(highIdx, 1);
  randomQueue.splice(lowIdx,  1);

  genderMatcher.dequeue(newSocketId);
  genderMatcher.dequeue(partnerId);

  _createRoom(socket, partnerSocket);
}

function isDeviceBanned(deviceId) {
  if (!deviceId) return null;
  const ban = bannedDevicesCache.get(deviceId);
  if (!ban) return null;
  if (ban.expiresAt && Date.now() > new Date(ban.expiresAt).getTime()) { bannedDevicesCache.delete(deviceId); Ban.deleteOne({deviceId}).catch(()=>{}); return null; }
  return ban;
}

async function banDeviceAndDisconnect(deviceId, banInfo) {
  bannedDevicesCache.set(deviceId, banInfo);
  await Ban.findOneAndUpdate({deviceId},{$set:banInfo},{upsert:true}).catch(()=>{});
  const socketsToDisconnect = [];
  for (const [,socket] of io.sockets.sockets) { if(socket.data.deviceId===deviceId)socketsToDisconnect.push(socket); }
  for (const socket of socketsToDisconnect) {
    removeFromQueue(socket.id); cancelAutoSearch(socket.id); genderMatcher.dequeue(socket.id);
    const result = removeSocketFromRooms(socket.id);
    if (result) { const {roomId,peers}=result; for(const [pid] of peers.entries()){const ps=io.sockets.sockets.get(pid);if(ps){ps.emit('partner-left',{socketId:socket.id,reason:'banned'});scheduleAutoSearch(ps);}} if(peers.size===0)rooms.delete(roomId); }
    socket.emit('device-banned', banInfo); socket.disconnect(true);
  }
  console.log(`🚫 Banned: ${deviceId.substring(0,12)}... - ${socketsToDisconnect.length} sockets`);
  return socketsToDisconnect.length;
}

function validateOreyId(id) { const clean=id.toUpperCase().trim(); if(clean.startsWith('OREY-'))return clean.length===10?clean:null; if(clean.length===5)return'OREY-'+clean; return null; }

const verifyApiKey = (req,res,next) => { const key=req.headers['x-api-key']; if(!key)return res.status(401).json({error:'API key required'}); if(key!==API_KEY)return res.status(403).json({error:'Invalid API key'}); next(); };
const verifySession = (req,res,next) => { const token=req.headers['x-session-token']||req.query.session_token||req.body.sessionToken; if(!token)return res.status(401).json({error:'Session token required'}); const session=ADMIN_SESSIONS.get(token); if(!session)return res.status(401).json({error:'Invalid session'}); if(session.expiresAt<Date.now()){ADMIN_SESSIONS.delete(token);return res.status(401).json({error:'Session expired'});} next(); };

function isNotifExpired(n) { if(!n.expiresIn||n.expiresIn<=0)return false; const expiry=new Date(n.timestamp);expiry.setDate(expiry.getDate()+n.expiresIn);return new Date()>expiry; }
async function saveNotification(notif) { notificationsCache.push(notif); await Notification.create(notif).catch(()=>{}); }
async function persistAppConfig() { await AppConfigModel.findByIdAndUpdate('main',{$set:appConfig},{upsert:true}).catch(()=>{}); }

const publicPath = (()=>{const paths=[path.join(__dirname,'public'),path.join(__dirname,'..','public'),path.join(__dirname,'src','public')];for(const p of paths){if(fs.existsSync(p)){console.log('📂 Public:',p);return p;}}const dp=path.join(__dirname,'..','public');if(!fs.existsSync(dp))fs.mkdirSync(dp,{recursive:true});return dp;})();

// ═══════════════════════════════════════ ROUTES ═══════════════════════════════

app.get('/health',(_req,res)=>res.json({status:'ok',timestamp:new Date().toISOString(),uptime:process.uptime(),activeConnections:io.engine.clientsCount,bannedDevices:bannedDevicesCache.size,activeAdminSessions:ADMIN_SESSIONS.size,memory:+((process.memoryUsage().heapUsed/1024/1024).toFixed(2)),dbState:mongoose.connection.readyState===1?'connected':'disconnected'}));

app.get('/generate-orey-id',(_req,res)=>{
  cleanExpiredOreyIds();
  let displayId,attempts=0;
  do{displayId=generateOreyDisplayId();attempts++;}while(oreyIds.has(displayId)&&attempts<20);
  const hashId=hashOreyId(displayId),expiresAt=Date.now()+OREY_ID_TTL_MS;
  oreyIds.set(displayId,{hashId,displayId,expiresAt,socketId:null,userName:''});
  OreyIdModel.create({hashId,displayId,socketId:null,userName:'',expiresAt:new Date(expiresAt)}).catch(()=>{});
  res.json({oreyId:displayId,hashId,expiresAt,format:'OREY-XXXXX',validDuration:'24 hours'});
});

app.get('/create-room',(_req,res)=>res.json({roomId:generateRoomId()}));
app.get('/api/get-key-hash',(_req,res)=>res.json({hash:crypto.createHash('sha256').update(API_KEY).digest('hex').substring(0,32)}));

app.get('/api/version',(req,res)=>{const p=req.query.platform||'android',cv=parseInt(req.query.version)||0,pc=appConfig[p];if(!pc)return res.status(400).json({error:'Invalid platform'});res.json(cv<pc.versionCode?{updateAvailable:true,...pc}:{updateAvailable:false,currentVersion:pc.versionName});});

app.get('/api/notifications',(req,res)=>{
  const lastId=parseInt(req.query.after_id)||0,deviceId=req.query.device_id,platform=req.query.platform||'all';
  if(deviceId)notificationSubscriptions.set(deviceId,{lastCheck:new Date().toISOString(),platform});
  let filtered=notificationsCache.filter(n=>{if(n.expiresIn&&n.expiresIn>0){const ed=new Date(n.timestamp);ed.setDate(ed.getDate()+n.expiresIn);if(new Date()>ed)return false;}return n.id>lastId;});
  if(platform!=='all')filtered=filtered.filter(n=>!n.targetPlatform||n.targetPlatform===platform||n.targetPlatform==='all');
  res.json({success:true,notifications:filtered,total:filtered.length,unread:filtered.filter(n=>!n.isRead).length,serverTime:new Date().toISOString(),lastId:filtered.length>0?Math.max(...filtered.map(n=>n.id)):lastId});
});

app.get('/api/config',(req,res)=>{const cv=parseInt(req.query.version)||0;res.json({features:{videoCall:true,hdVideo:cv>=2,groupCall:false,screenShare:cv>=3,reporting:true,safetyFeatures:true,chat:true,genderMatching:true},videoQuality:appConfig.videoQuality,iceServers:ICE_SERVERS,safety:appConfig.safety,reportReasons:{highPriority:HIGH_PRIORITY_REASONS,regular:REGULAR_REASONS},urls:{mainApp:process.env.MAIN_APP_URL||'https://parallel-elsi-seeutech-50a3ab2e.koyeb.app/',help:'https://orey.app/help',safety:'https://orey.app/safety',guidelines:'https://orey.app/community-guidelines'},maintenance:appConfig.maintenance});});

app.post('/api/device/register',verifyApiKey,(req,res)=>{
  const{deviceId,platform}=req.body;if(!deviceId)return res.status(400).json({error:'deviceId required'});
  const bi=isDeviceBanned(deviceId);if(bi)return res.status(403).json({error:'Device banned',banned:true,reason:bi.reason,timestamp:bi.timestamp,expiresAt:bi.expiresAt||null,durationHours:bi.durationHours||null,permanent:!bi.expiresAt});
  console.log('📱 Device:',deviceId.substring(0,12)+'...');res.json({success:true,deviceId,registered:true,timestamp:new Date().toISOString()});
});

app.post('/api/device/check-ban',verifyApiKey,(req,res)=>{const{deviceId}=req.body;if(!deviceId)return res.status(400).json({error:'deviceId required'});const bi=isDeviceBanned(deviceId);if(bi)return res.status(403).json({banned:true,...bi});res.json({banned:false});});

app.post('/api/report',verifyApiKey,async(req,res)=>{
  const{reporterDeviceId,reportedDeviceId,reportedUserId,reason,description,evidence}=req.body;
  if(!reportedDeviceId||!reason)return res.status(400).json({error:'reportedDeviceId and reason required'});
  if(!reporterDeviceId)return res.status(400).json({error:'reporterDeviceId required'});
  if(reporterDeviceId===reportedDeviceId)return res.status(400).json({error:'Cannot report yourself'});
  const rd=await ReportCount.findOne({deviceId:reportedDeviceId}).lean();
  if(rd?.reportedBy?.includes(reporterDeviceId))return res.status(400).json({error:'Already reported',alreadyReported:true});
  const reportId=generateRoomId(),isHP=HIGH_PRIORITY_REASONS.includes(reason);
  await Report.create({id:reportId,reporterDeviceId,reportedDeviceId,reportedUserId:reportedUserId||null,reason,description:description||'',evidence:evidence||null,timestamp:new Date().toISOString(),status:'pending',reviewedBy:null,reviewNotes:'',reviewedAt:null,autoBanned:false,isHighPriority:isHP});
  const counter=await ReportCount.findOneAndUpdate({deviceId:reportedDeviceId},{$inc:{total:1,...(isHP?{highPriority:1}:{})},$addToSet:{reportedBy:reporterDeviceId}},{upsert:true,new:true});
  let ab=false,bi=null;
  if((isHP&&counter.highPriority>=HIGH_PRIORITY_BAN_THRESHOLD)||(!isHP&&counter.total>=AUTO_BAN_THRESHOLD)){
    if(appConfig.safety.autoBanEnabled){const bd=isHP?0:DEFAULT_BAN_DURATION_HOURS;bi={deviceId:reportedDeviceId,reason:isHP?`Auto-banned (HP): ${counter.highPriority} reports`:`Auto-banned: ${counter.total} reports`,timestamp:new Date().toISOString(),expiresAt:bd>0?new Date(Date.now()+bd*3600000):null,durationHours:bd>0?bd:null,permanent:bd===0,source:'auto',isHighPriority:isHP,reportIds:[]};await Report.updateMany({reportedDeviceId},{$set:{status:'auto_banned',autoBanned:true}});await banDeviceAndDisconnect(reportedDeviceId,bi);ab=true;}
  }
  res.json({success:true,reportId,reportCount:counter.total,highPriorityCount:counter.highPriority,isHighPriority:isHP,autoBanned:ab,banInfo:bi||null,thresholds:{regular:AUTO_BAN_THRESHOLD,highPriority:HIGH_PRIORITY_BAN_THRESHOLD}});
});

app.put('/api/notifications/:id/read',verifyApiKey,async(req,res)=>{
  const id=parseInt(req.params.id),notif=notificationsCache.find(n=>n.id===id);
  if(!notif)return res.status(404).json({error:'Not found'});
  notif.isRead=true;notif.readAt=new Date().toISOString();notif.readBy=req.body.deviceId||'unknown';
  await Notification.findOneAndUpdate({id},{$set:{isRead:true,readAt:notif.readAt,readBy:notif.readBy}}).catch(()=>{});
  res.json({success:true,notification:notif});
});

app.put('/api/notifications/read-all',verifyApiKey,async(req,res)=>{
  const deviceId=req.body.deviceId||'unknown';let marked=0;
  for(const n of notificationsCache){if(!n.isRead){n.isRead=true;n.readAt=new Date().toISOString();n.readBy=deviceId;marked++;}}
  await Notification.updateMany({isRead:false},{$set:{isRead:true,readAt:new Date().toISOString(),readBy:deviceId}}).catch(()=>{});
  res.json({success:true,markedAsRead:marked});
});

app.post('/admin/login',(req,res)=>{
  const{adminKey}=req.body;if(!adminKey)return res.status(400).json({error:'Admin key required'});if(adminKey!==ADMIN_KEY)return res.status(403).json({error:'Invalid admin key'});
  const st=generateSessionToken(),ea=Date.now()+SESSION_DURATION_MS;ADMIN_SESSIONS.set(st,{expiresAt:ea,createdAt:Date.now()});
  console.log('🔐 Admin login');res.json({success:true,sessionToken:st,expiresAt:new Date(ea).toISOString(),durationHours:SESSION_DURATION_MS/(60*60*1000)});
});

app.post('/admin/logout',(req,res)=>{const t=req.headers['x-session-token']||req.body.sessionToken;if(t)ADMIN_SESSIONS.delete(t);res.json({success:true,message:'Logged out'});});

app.get('/admin/gender-stats',verifySession,(_req,res)=>res.json({...genderMatcher.stats(),randomQueueLength:randomQueue.length}));

app.get('/admin/notifications',verifySession,(req,res)=>{const active=notificationsCache.filter(n=>!isNotifExpired(n));res.json({notifications:notificationsCache,total:notificationsCache.length,active:active.length});});

app.post('/admin/notifications',verifySession,async(req,res)=>{
  const{title,message,type,priority,actionUrl,icon,imageUrl,expiresIn,targetPlatform}=req.body;
  if(!title||!message)return res.status(400).json({error:'Title and message required'});
  const nn={id:notificationIdCounter++,title,message,type:type||'info',priority:priority||'normal',targetPlatform:targetPlatform||'all',targetDeviceIds:[],timestamp:new Date().toISOString(),actionUrl:actionUrl||'/',icon:icon||'📢',imageUrl:imageUrl||null,isRead:false,readAt:null,readBy:null,expiresIn:expiresIn||30};
  await saveNotification(nn);io.emit('new-notification',nn);
  res.json({success:true,notification:nn,activeClients:io.engine.clientsCount});
});

app.get('/admin/notifications/stats',verifySession,(req,res)=>{
  const s={total:notificationsCache.length,active:0,unread:0,byType:{},byPriority:{},subscriptions:notificationSubscriptions.size};
  for(const n of notificationsCache){if(!isNotifExpired(n))s.active++;if(!n.isRead)s.unread++;s.byType[n.type]=(s.byType[n.type]||0)+1;s.byPriority[n.priority]=(s.byPriority[n.priority]||0)+1;}
  res.json(s);
});

app.delete('/admin/notifications/:id',verifySession,async(req,res)=>{
  const id=parseInt(req.params.id),idx=notificationsCache.findIndex(n=>n.id===id);
  if(idx===-1)return res.status(404).json({error:'Not found'});
  notificationsCache.splice(idx,1);await Notification.deleteOne({id}).catch(()=>{});
  res.json({success:true,deleted:true});
});

app.post('/admin/maintenance',verifySession,async(req,res)=>{
  const{enabled,message}=req.body;appConfig.maintenance={enabled:enabled||false,message:message||''};
  await persistAppConfig();io.emit('maintenance-mode',appConfig.maintenance);
  res.json({success:true,maintenance:appConfig.maintenance});
});

app.put('/admin/video-quality',verifySession,async(req,res)=>{
  const{default:def,autoAdjust,maxBitrate}=req.body;
  if(def&&VIDEO_QUALITY[def])appConfig.videoQuality.default=def;
  if(autoAdjust!==undefined)appConfig.videoQuality.autoAdjust=autoAdjust;
  if(maxBitrate)appConfig.videoQuality.maxBitrate=maxBitrate;
  await persistAppConfig();io.emit('video-quality-update',appConfig.videoQuality);
  res.json({success:true,videoQuality:appConfig.videoQuality});
});

app.put('/admin/safety-settings',verifySession,async(req,res)=>{
  const{autoBanEnabled,autoBanThreshold,highPriorityThreshold,reportingEnabled,contentModeration}=req.body;
  if(autoBanEnabled!==undefined)appConfig.safety.autoBanEnabled=autoBanEnabled;
  if(autoBanThreshold)appConfig.safety.autoBanThreshold=autoBanThreshold;
  if(highPriorityThreshold)appConfig.safety.highPriorityThreshold=highPriorityThreshold;
  if(reportingEnabled!==undefined)appConfig.safety.reportingEnabled=reportingEnabled;
  if(contentModeration!==undefined)appConfig.safety.contentModeration=contentModeration;
  await persistAppConfig();io.emit('safety-settings-update',appConfig.safety);
  res.json({success:true,safety:appConfig.safety});
});

app.get('/admin/reports',verifySession,async(req,res)=>{
  const f={};if(req.query.status)f.status=req.query.status;
  const ar=await Report.find(f).sort({timestamp:-1}).lean();
  res.json({reports:ar,total:ar.length,pending:await Report.countDocuments({status:'pending'}),autoBanned:await Report.countDocuments({status:'auto_banned'}),highPriority:await Report.countDocuments({isHighPriority:true}),activeBans:bannedDevicesCache.size});
});

app.post('/admin/reports/:reportId/action',verifySession,async(req,res)=>{
  const{reportId}=req.params,{action,banDuration,notes}=req.body;
  const report=await Report.findOne({id:reportId});if(!report)return res.status(404).json({error:'Not found'});
  if(report.status!=='pending')return res.status(400).json({error:`Already ${report.status}`});
  report.reviewedAt=new Date().toISOString();report.reviewNotes=notes||'';
  switch(action){
    case'ban':{const d=banDuration||DEFAULT_BAN_DURATION_HOURS,bi={deviceId:report.reportedDeviceId,reason:report.reason,timestamp:new Date().toISOString(),expiresAt:d>0?new Date(Date.now()+d*3600000):null,durationHours:d>0?d:null,permanent:d===0,source:'admin',isHighPriority:report.isHighPriority,reportIds:[reportId]};await banDeviceAndDisconnect(report.reportedDeviceId,bi);report.status='banned';break;}
    case'dismiss':report.status='dismissed';break;
    case'warn':report.status='warned';for(const[,s]of io.sockets.sockets){if(s.data.deviceId===report.reportedDeviceId)s.emit('warning',{reason:report.reason,message:'Warning for violating guidelines.'});}break;
    default:return res.status(400).json({error:'Invalid action'});
  }
  await report.save();res.json({success:true,report});
});

app.post('/admin/ban-device',verifySession,async(req,res)=>{
  const{deviceId,reason,durationHours}=req.body;if(!deviceId)return res.status(400).json({error:'deviceId required'});
  if(isDeviceBanned(deviceId))return res.status(400).json({error:'Already banned'});
  const bi={deviceId,reason:reason||'Violation of terms',timestamp:new Date().toISOString(),expiresAt:durationHours?new Date(Date.now()+durationHours*3600000):null,durationHours:durationHours||null,permanent:!durationHours,source:'manual',isHighPriority:false,reportIds:[]};
  const dced=await banDeviceAndDisconnect(deviceId,bi);
  res.json({success:true,deviceId:deviceId.substring(0,12)+'...',banInfo:bi,socketsDisconnected:dced});
});

app.delete('/admin/ban-device/:deviceId',verifySession,async(req,res)=>{
  let{deviceId}=req.params;try{deviceId=decodeURIComponent(deviceId);}catch(e){}
  let found=null;
  if(bannedDevicesCache.has(deviceId))found=deviceId;
  else{for(const[id]of bannedDevicesCache.entries()){if(id.toLowerCase()===deviceId.toLowerCase()||id.includes(deviceId)||deviceId.includes(id)){found=id;break;}}}
  if(!found){const clean=deviceId.replace(/\.\.\.$/,'').replace(/[^A-Za-z0-9\-]/g,'');for(const[id]of bannedDevicesCache.entries()){if(id.startsWith(clean)){found=id;break;}}}
  if(!found)return res.status(404).json({error:'Not banned'});
  bannedDevicesCache.delete(found);await Ban.deleteOne({deviceId:found});await ReportCount.updateOne({deviceId:found},{$set:{total:0,highPriority:0}});
  res.json({success:true,message:'Unbanned'});
});

app.get('/admin/banned-devices',verifySession,async(req,res)=>{
  for(const[deviceId,info]of bannedDevicesCache.entries()){if(info.expiresAt&&Date.now()>new Date(info.expiresAt).getTime()){bannedDevicesCache.delete(deviceId);await Ban.deleteOne({deviceId}).catch(()=>{});}}
  const list=[...bannedDevicesCache.entries()].map(([deviceId,info])=>({deviceId,reason:info.reason,timestamp:info.timestamp,expiresAt:info.expiresAt||null,permanent:info.permanent||false,isHighPriority:info.isHighPriority||false,source:info.source||'manual'})).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  res.json({bannedDevices:list,total:list.length});
});

app.get('/admin/stats',verifySession,async(req,res)=>{
  res.json({activeConnections:io.engine.clientsCount,activeRooms:rooms.size,bannedDevices:bannedDevicesCache.size,pendingReports:await Report.countDocuments({status:'pending'}),totalNotifications:notificationsCache.length,activeAdminSessions:ADMIN_SESSIONS.size,uptime:process.uptime(),memoryMB:+((process.memoryUsage().heapUsed/1024/1024).toFixed(2)),safetySettings:appConfig.safety,dbState:mongoose.connection.readyState===1?'connected':'disconnected',genderStats:{...genderMatcher.stats(),randomQueueLength:randomQueue.length}});
});

app.get('/admin',(_req,res)=>{
  const ap=path.join(publicPath,'admin.html');
  if(fs.existsSync(ap))return res.sendFile(ap);
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Admin</title><style>body{font-family:system-ui;background:#0b0f17;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh}.box{text-align:center;background:#1e293b;padding:2rem;border-radius:24px}h1{color:#3b82f6}</style></head><body><div class="box"><h1>🔷 Admin</h1><p>Place admin.html in public/</p></div></body></html>');
});

app.get('/admin.html',(_req,res)=>res.redirect('/admin'));
app.use(express.static(publicPath));

app.get('*',(req,res)=>{
  if(req.path.startsWith('/api/'))return res.status(404).json({error:'Not found'});
  if(req.path.startsWith('/admin/')&&req.path!=='/admin')return res.redirect('/admin');
  const ip=path.join(publicPath,'index.html');
  if(fs.existsSync(ip))return res.sendFile(ip);
  res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+SERVICE_NAME+'</title><style>body{font-family:system-ui;background:#0b0f17;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh}.c{text-align:center;background:#1e293b;padding:3rem;border-radius:24px}h1{color:#3b82f6}</style></head><body><div class="c"><h1>🔷 '+SERVICE_NAME+'</h1><p>🟢 Running</p></div></body></html>');
});

// ═══════════════════════════════════ SOCKET.IO ═══════════════════════════════

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} (Total: ${io.engine.clientsCount})`);
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
    if (!reporterDeviceId) { socket.emit('report-error', { error: 'Device not registered' }); return; }
    if (!reportedDeviceId || !reason) { socket.emit('report-error', { error: 'Fields required' }); return; }
    if (reporterDeviceId === reportedDeviceId) { socket.emit('report-error', { error: 'Cannot report yourself' }); return; }
    const rd = await ReportCount.findOne({ deviceId: reportedDeviceId }).lean();
    if (rd?.reportedBy?.includes(reporterDeviceId)) { socket.emit('report-error', { error: 'Already reported' }); return; }
    const reportId = generateRoomId(), isHP = HIGH_PRIORITY_REASONS.includes(reason);
    await Report.create({ id: reportId, reporterDeviceId, reportedDeviceId, reportedUserId: reportedUserId || null, reason, description: description || '', evidence: null, timestamp: new Date().toISOString(), status: 'pending', reviewedBy: null, reviewNotes: '', reviewedAt: null, autoBanned: false, isHighPriority: isHP });
    const counter = await ReportCount.findOneAndUpdate({ deviceId: reportedDeviceId }, { $inc: { total: 1, ...(isHP ? { highPriority: 1 } : {}) }, $addToSet: { reportedBy: reporterDeviceId } }, { upsert: true, new: true });
    let ab = false;
    if ((isHP && counter.highPriority >= HIGH_PRIORITY_BAN_THRESHOLD) || (!isHP && counter.total >= AUTO_BAN_THRESHOLD)) {
      if (appConfig.safety.autoBanEnabled) {
        const bd = isHP ? 0 : DEFAULT_BAN_DURATION_HOURS;
        const bi = { deviceId: reportedDeviceId, reason: `Auto-banned: ${counter.total} reports`, timestamp: new Date().toISOString(), expiresAt: bd > 0 ? new Date(Date.now() + bd * 3600000) : null, durationHours: bd || null, permanent: bd === 0, source: 'auto', isHighPriority: isHP, reportIds: [] };
        await Report.updateMany({ reportedDeviceId }, { $set: { status: 'auto_banned', autoBanned: true } });
        await banDeviceAndDisconnect(reportedDeviceId, bi);
        ab = true;
      }
    }
    socket.emit('report-submitted', { success: true, reportId, reportCount: counter.total, autoBanned: ab });
  });

  socket.on('register-orey-id', ({ oreyId, userName }) => {
    cleanExpiredOreyIds();
    const vid = validateOreyId(oreyId);
    if (!vid) { socket.emit('orey-id-invalid', { error: 'Invalid format' }); return; }
    const entry = oreyIds.get(vid);
    if (!entry) { socket.emit('orey-id-invalid', { error: 'Not found' }); return; }
    if (entry.expiresAt < Date.now()) { oreyIds.delete(vid); socket.emit('orey-id-expired'); return; }
    entry.socketId = socket.id; entry.userName = userName || 'Anonymous';
    socket.data.oreyId = vid; socket.data.userName = userName || 'Anonymous';
    socket.emit('orey-id-registered', { oreyId: vid, expiresAt: entry.expiresAt });
  });

  socket.on('connect-by-orey-id', ({ targetOreyId }) => {
    cleanExpiredOreyIds();
    const vid = validateOreyId(targetOreyId);
    if (!vid) { socket.emit('orey-id-invalid', { error: 'Invalid format' }); return; }
    let entry = oreyIds.get(vid);
    if (!entry) { for (const [k, v] of oreyIds.entries()) { if (v.hashId === targetOreyId || k.startsWith(targetOreyId)) { entry = v; break; } } }
    if (!entry) { socket.emit('orey-id-not-found'); return; }
    if (entry.expiresAt < Date.now()) { oreyIds.delete(vid); socket.emit('orey-id-expired'); return; }
    if (!entry.socketId) { socket.emit('orey-id-offline'); return; }
    const ts = io.sockets.sockets.get(entry.socketId);
    if (!ts) { entry.socketId = null; socket.emit('orey-id-offline'); return; }
    if (ts.id === socket.id) { socket.emit('orey-id-invalid', { error: 'Cannot call yourself' }); return; }
    const roomId = generateRoomId(); rooms.set(roomId, new Map());
    socket.join(roomId); ts.join(roomId);
    const cd = { userName: socket.data.userName || 'Anonymous', oreyId: socket.data.oreyId || null, deviceId: socket.data.deviceId || null, gender: socket.data.gender || null };
    const calleeD = { userName: entry.userName, oreyId: vid, deviceId: ts.data.deviceId || null, gender: ts.data.gender || null };
    rooms.get(roomId).set(socket.id, cd); rooms.get(roomId).set(entry.socketId, calleeD);
    const rd = { roomId, videoQuality: appConfig.videoQuality, iceServers: ICE_SERVERS };
    socket.emit('room-joined', { ...rd, peers: [{ socketId: entry.socketId, ...calleeD }] });
    ts.emit('room-joined', { ...rd, peers: [{ socketId: socket.id, ...cd }] });
    ts.emit('incoming-call', { fromName: cd.userName, fromOreyId: cd.oreyId });
  });

  // ═══════════════════════════════════════════
  // 🆕 PATCH 4 — join-random handler
  // ═══════════════════════════════════════════
  socket.on('join-random', () => {
    cancelAutoSearch(socket.id);
    removeFromQueue(socket.id);
    genderMatcher.dequeue(socket.id);

    const gender = socket.data.gender || null;

    if (gender) {
      genderMatcher.enqueue(socket.id, gender);
      genderMatcher.startTimer(socket.id, gender);
      socket.emit('waiting-for-match', { gender, stage: 'gender', timerSeconds: 3, genderStats: genderMatcher.stats() });
    } else {
      randomQueue.push(socket.id);
      socket.emit('waiting-for-match', { gender: null, stage: 'open', genderStats: genderMatcher.stats() });
    }

    attemptMatch(socket.id);
  });

  socket.on('cancel-random', () => {
    removeFromQueue(socket.id);
    cancelAutoSearch(socket.id);
    genderMatcher.dequeue(socket.id);
    socket.emit('random-cancelled');
  });

  // ═══════════════════════════════════════════
  // 🆕 PATCH 5 — set-gender handler
  // ═══════════════════════════════════════════
  socket.on('set-gender', ({ gender }) => {
    const normalised = genderMatcher.normalise(gender);
    socket.data.gender = normalised;

    const inRandom = randomQueue.includes(socket.id);
    if (inRandom && normalised) {
      removeFromQueue(socket.id);
      genderMatcher.enqueue(socket.id, normalised);
      genderMatcher.startTimer(socket.id, normalised);
      attemptMatch(socket.id);
    }

    if (genderMatcher.isQueued(socket.id) && normalised) {
      genderMatcher.enqueue(socket.id, normalised);
      genderMatcher.startTimer(socket.id, normalised);
    }

    socket.emit('gender-set', {
      gender: normalised,
      accepted: normalised !== null,
      message: normalised
        ? `Matching you with ${normalised === 'male' ? 'females' : 'males'} first.`
        : 'Gender cleared — standard random matching.',
    });

    console.log(`⚧ Gender: ${socket.id.slice(0, 8)} → ${normalised ?? 'none'}`);
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

  socket.on('offer',         ({ targetId, offer     }) => io.to(targetId).emit('offer',         { offer,      fromId: socket.id }));
  socket.on('answer',        ({ targetId, answer    }) => io.to(targetId).emit('answer',        { answer,     fromId: socket.id }));
  socket.on('ice-candidate', ({ targetId, candidate }) => io.to(targetId).emit('ice-candidate', { candidate,  fromId: socket.id }));
  socket.on('media-state',   ({ roomId, audioEnabled, videoEnabled }) => socket.to(roomId).emit('peer-media-state', { socketId: socket.id, audioEnabled, videoEnabled }));

  socket.on('chat-message', ({ roomId, message, type }) => {
    if (!roomId || !message) { socket.emit('chat-error', { error: 'roomId and message required' }); return; }
    const room = rooms.get(roomId);
    if (!room || !room.has(socket.id)) { socket.emit('chat-error', { error: 'Not in room' }); return; }
    io.to(roomId).emit('chat-message', { id: generateRoomId(), senderId: socket.id, senderName: socket.data.userName || 'Anonymous', message: message.substring(0, 500), type: type || 'text', timestamp: new Date().toISOString(), roomId });
  });

  socket.on('chat-typing', ({ roomId, isTyping }) => {
    socket.to(roomId).emit('peer-typing', { socketId: socket.id, userName: socket.data.userName || 'Anonymous', isTyping });
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
    console.log(`[-] ${socket.id}`);
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

setInterval(() => {
  const before = notificationsCache.length;
  notificationsCache = notificationsCache.filter(n => !isNotifExpired(n));
  if (before - notificationsCache.length > 0) console.log('🧹 Cleaned expired notifications');
}, 3600000);

setInterval(cleanExpiredOreyIds, 10 * 60 * 1000);

setInterval(() => {
  const now = Date.now();
  for (const [token, data] of ADMIN_SESSIONS.entries()) { if (data.expiresAt < now) ADMIN_SESSIONS.delete(token); }
}, 15 * 60 * 1000);

async function start() {
  try {
    await initDB();
    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🚀 ${SERVICE_NAME} on :${PORT}`);
      console.log(`🖥️  Admin: http://localhost:${PORT}/admin`);
      console.log(`⚧  Gender Match: 3s timer (server-side)`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (err) { console.error('❌ Startup failed:', err.message); process.exit(1); }
}

start();
