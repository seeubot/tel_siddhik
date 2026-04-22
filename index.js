/**
 * Maya Connect — API Server
 * Koyeb Account 2
 *
 * Endpoints:
 *  POST   /api/users/register          Register / resume a device session
 *  POST   /api/users/reset-id          Generate a new MC-ID for a device
 *  GET    /api/users/reconnect/:mcId   Look up a user by MC-ID
 *  GET    /api/bans/check/:deviceId    Check active ban status
 *  POST   /api/reports                 Submit a report → auto-applies ban rules
 *  POST   /api/blocks                  Block a device (prevent re-matching)
 *  GET    /api/blocks/:deviceId        Get the block list for a device
 *  POST   /api/sessions                Log a completed session (analytics)
 *  GET    /ping                        Health-check for CronJob.org
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3002;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// ─── MongoDB connection ───────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mayaconnect', {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });

// ─── Schemas & Models ─────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  deviceId:    { type: String, required: true, unique: true, index: true },
  reconnectId: { type: String, required: true, unique: true, index: true },
  createdAt:   { type: Date,   default: Date.now },
  lastSeen:    { type: Date,   default: Date.now },
  banStatus:   { type: String, enum: ['none', 'temporary', 'permanent'], default: 'none' },
  banExpiry:   { type: Date,   default: null },
});

const reportSchema = new mongoose.Schema({
  reporterId: { type: String, required: true },
  reportedId: { type: String, required: true },   // deviceId of reported user
  sessionId:  { type: String, required: true },
  reason:     { type: String, required: true },
  timestamp:  { type: Date,   default: Date.now },
});
reportSchema.index({ reportedId: 1, timestamp: -1 });
reportSchema.index({ reporterId: 1, sessionId: 1 }, { unique: true }); // no duplicate per session

const blockSchema = new mongoose.Schema({
  blockerId:  { type: String, required: true },
  blockedId:  { type: String, required: true },
  timestamp:  { type: Date,   default: Date.now },
});
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

const sessionSchema = new mongoose.Schema({
  user1Id:   String,
  user2Id:   String,
  startTime: Date,
  endTime:   Date,
  duration:  Number,  // seconds
});

const banSchema = new mongoose.Schema({
  deviceId:    { type: String, required: true, index: true },
  reason:      String,
  expiresAt:   Date,
  isPermanent: { type: Boolean, default: false },
  createdAt:   { type: Date, default: Date.now },
});

const User    = mongoose.model('User',    userSchema);
const Report  = mongoose.model('Report',  reportSchema);
const Block   = mongoose.model('Block',   blockSchema);
const Session = mongoose.model('Session', sessionSchema);
const Ban     = mongoose.model('Ban',     banSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a unique MC-XXXXX reconnect ID */
async function newReconnectId() {
  for (let i = 0; i < 20; i++) {
    const id = `MC-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!(await User.exists({ reconnectId: id }))) return id;
  }
  throw new Error('Could not generate unique reconnect ID');
}

/**
 * Apply PRD ban rules after a new report for deviceId.
 * Rules (checked in order of severity):
 *   10+ lifetime reports → permanent ban
 *   5+ reports in 7 days → 7-day ban
 *   3+ reports in 24 h   → 24-h ban
 */
async function applyBanRules(deviceId) {
  const now = new Date();
  const h24 = new Date(now - 24 * 3600 * 1000);
  const d7  = new Date(now - 7 * 24 * 3600 * 1000);

  const [count24h, count7d, countTotal] = await Promise.all([
    Report.countDocuments({ reportedId: deviceId, timestamp: { $gte: h24 } }),
    Report.countDocuments({ reportedId: deviceId, timestamp: { $gte: d7  } }),
    Report.countDocuments({ reportedId: deviceId }),
  ]);

  let banUpdate = null;

  if (countTotal >= 10) {
    banUpdate = { banStatus: 'permanent', banExpiry: null };
    await Ban.create({ deviceId, reason: '10+ lifetime reports', isPermanent: true });
  } else if (count7d >= 5) {
    const expiry = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    banUpdate = { banStatus: 'temporary', banExpiry: expiry };
    await Ban.create({ deviceId, reason: '5+ reports in 7 days', expiresAt: expiry });
  } else if (count24h >= 3) {
    const expiry = new Date(now.getTime() + 24 * 3600 * 1000);
    banUpdate = { banStatus: 'temporary', banExpiry: expiry };
    await Ban.create({ deviceId, reason: '3+ reports in 24 h', expiresAt: expiry });
  }

  if (banUpdate) {
    await User.updateOne({ deviceId }, banUpdate);
  }
}

// ─── Health-check ─────────────────────────────────────────────────────────────
app.get('/ping', (_req, res) => res.send('pong'));

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/users/register
 * Body: { deviceId: string }
 * Returns: { reconnectId, banStatus, banExpiry }
 *
 * Creates user on first visit; on subsequent visits checks ban expiry.
 */
app.post('/api/users/register', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId || typeof deviceId !== 'string') {
      return res.status(400).json({ error: 'deviceId is required' });
    }

    let user = await User.findOne({ deviceId });

    if (!user) {
      user = await User.create({
        deviceId,
        reconnectId: await newReconnectId(),
      });
    } else {
      // Lift expired temporary ban
      if (user.banStatus === 'temporary' && user.banExpiry && user.banExpiry < new Date()) {
        user.banStatus = 'none';
        user.banExpiry = null;
      }
      user.lastSeen = new Date();
      await user.save();
    }

    return res.json({
      reconnectId: user.reconnectId,
      banStatus:   user.banStatus,
      banExpiry:   user.banExpiry,
    });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/users/reset-id
 * Body: { deviceId: string }
 * Returns: { reconnectId }
 */
app.post('/api/users/reset-id', async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'deviceId is required' });

    const reconnectId = await newReconnectId();
    await User.updateOne({ deviceId }, { reconnectId });
    return res.json({ reconnectId });
  } catch (err) {
    console.error('[reset-id]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/users/reconnect/:mcId
 * Returns: { reconnectId, lastSeen, available }
 */
app.get('/api/users/reconnect/:mcId', async (req, res) => {
  try {
    const user = await User.findOne({ reconnectId: req.params.mcId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      reconnectId: user.reconnectId,
      lastSeen:    user.lastSeen,
      available:   user.banStatus === 'none',
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/bans/check/:deviceId
 * Returns: { banned, banStatus, banExpiry }
 */
app.get('/api/bans/check/:deviceId', async (req, res) => {
  try {
    const user = await User.findOne({ deviceId: req.params.deviceId });
    if (!user) return res.json({ banned: false, banStatus: 'none', banExpiry: null });

    // Lift expired ban
    if (user.banStatus === 'temporary' && user.banExpiry && user.banExpiry < new Date()) {
      user.banStatus = 'none';
      user.banExpiry = null;
      await user.save();
    }

    return res.json({
      banned:    user.banStatus !== 'none',
      banStatus: user.banStatus,
      banExpiry: user.banExpiry,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/reports
 * Body: { reporterId, reportedId, sessionId, reason }
 */
app.post('/api/reports', async (req, res) => {
  try {
    const { reporterId, reportedId, sessionId, reason } = req.body;

    if (!reporterId || !reportedId || !sessionId || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Prevent self-report
    if (reporterId === reportedId) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }

    // Duplicate check (unique index will also catch this)
    const exists = await Report.exists({ reporterId, sessionId });
    if (exists) {
      return res.status(409).json({ error: 'Already reported this session' });
    }

    await Report.create({ reporterId, reportedId, sessionId, reason });
    await applyBanRules(reportedId);

    return res.json({ success: true });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Already reported this session' });
    }
    console.error('[report]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/blocks
 * Body: { blockerId, blockedId }
 */
app.post('/api/blocks', async (req, res) => {
  try {
    const { blockerId, blockedId } = req.body;
    if (!blockerId || !blockedId) return res.status(400).json({ error: 'Missing fields' });

    await Block.updateOne(
      { blockerId, blockedId },
      { $setOnInsert: { timestamp: new Date() } },
      { upsert: true }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/blocks/:deviceId
 * Returns: { blocked: string[] }  — list of deviceIds this user has blocked
 */
app.get('/api/blocks/:deviceId', async (req, res) => {
  try {
    const rows = await Block.find({ blockerId: req.params.deviceId }, 'blockedId');
    return res.json({ blocked: rows.map(r => r.blockedId) });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/sessions
 * Body: { user1Id, user2Id, startTime, endTime }
 * Analytics log — fire-and-forget from frontend
 */
app.post('/api/sessions', async (req, res) => {
  try {
    const { user1Id, user2Id, startTime, endTime } = req.body;
    const duration = startTime && endTime
      ? Math.round((new Date(endTime) - new Date(startTime)) / 1000)
      : 0;

    await Session.create({ user1Id, user2Id, startTime, endTime, duration });
    return res.json({ success: true });
  } catch (err) {
    console.error('[session-log]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API server listening on port ${PORT}`);
});
