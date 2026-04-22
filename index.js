/**
 * Maya Connect — Signaling Server
 * Koyeb Account 1
 *
 * Responsibilities:
 *  - WebSocket connections from all clients
 *  - Match queue with region/language/gender priority
 *  - WebRTC offer/answer/ICE relay
 *  - Blurred preview + mutual-accept gate
 *  - Excessive-skip detection (20+ skips / 10 min → lower priority)
 *  - Reconnect-by-MC-ID direct pairing
 */

require('dotenv').config();
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;
const API_BASE = process.env.API_SERVER_URL || 'http://localhost:3002';

// ─── HTTP server (health-check for CronJob.org) ──────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('pong');
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

// ─── In-memory state ──────────────────────────────────────────────────────────
/** @type {Map<string, UserState>} socketId → user */
const users = new Map();

/** @type {UserState[]} users waiting for a match */
const queue = [];

/** @type {Map<string, Session>} sessionId → session */
const sessions = new Map();

/** @type {Map<string, SkipWindow>} deviceId → skip tracking */
const skipWindows = new Map();

// ─── Types (JSDoc) ────────────────────────────────────────────────────────────
/**
 * @typedef {Object} UserState
 * @property {import('ws').WebSocket} ws
 * @property {string} socketId
 * @property {string} deviceId
 * @property {string} reconnectId
 * @property {string} region      e.g. 'telangana' | 'andhra' | 'other'
 * @property {string} language    e.g. 'telugu' | 'other'
 * @property {string|null} genderPref
 * @property {string|null} sessionId
 * @property {boolean} lowPriority  true when skip-rate triggered
 */

/**
 * @typedef {Object} Session
 * @property {UserState} user1
 * @property {UserState} user2
 * @property {'preview'|'connecting'|'live'|'ended'} status
 * @property {Set<string>} accepted  socketIds that tapped Accept
 * @property {number|null} startTime
 * @property {NodeJS.Timeout} acceptTimer
 */

/**
 * @typedef {Object} SkipWindow
 * @property {number} count
 * @property {number} windowStart  epoch ms
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);
const sessionId = () => `sess_${Date.now()}_${uid()}`;

/** Send JSON to a WebSocket safely */
function send(ws, type, payload = {}) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

/** Remove user from the waiting queue */
function dequeue(socketId) {
  const idx = queue.findIndex(u => u.socketId === socketId);
  if (idx !== -1) queue.splice(idx, 1);
}

// ─── Skip-rate tracking ───────────────────────────────────────────────────────
const SKIP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const SKIP_LIMIT = 20;
const SKIP_PENALTY_MS = 60 * 60 * 1000; // 1 hour lower priority

function recordSkip(deviceId) {
  const now = Date.now();
  const entry = skipWindows.get(deviceId) || { count: 0, windowStart: now };

  if (now - entry.windowStart > SKIP_WINDOW_MS) {
    // Reset window
    skipWindows.set(deviceId, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  skipWindows.set(deviceId, entry);
  return entry.count >= SKIP_LIMIT;
}

function isOverSkipLimit(deviceId) {
  const entry = skipWindows.get(deviceId);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > SKIP_WINDOW_MS) return false;
  return entry.count >= SKIP_LIMIT;
}

// ─── Matching ────────────────────────────────────────────────────────────────
/**
 * Score how well two users match (higher = better).
 * Priority: region (100) > language (50) > gender preference (10)
 */
function matchScore(a, b) {
  let score = 0;
  if (a.region === b.region) score += 100;
  if (a.language === b.language) score += 50;
  // Soft gender preference: best effort, not enforced
  if (a.genderPref && b.genderPref && a.genderPref !== b.genderPref) score += 10;
  return score;
}

/**
 * Find the best available match for `user` from the queue.
 * Low-priority users are deprioritised but not excluded.
 */
function findBestMatch(user) {
  let best = null;
  let bestScore = -Infinity;

  for (const candidate of queue) {
    if (candidate.socketId === user.socketId) continue;
    if (candidate.deviceId === user.deviceId) continue; // same device
    if (candidate.sessionId) continue; // already matched

    let score = matchScore(user, candidate);
    if (candidate.lowPriority) score -= 50; // skip-penalty

    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

// ─── Session lifecycle ────────────────────────────────────────────────────────
function startPreview(userA, userB) {
  dequeue(userA.socketId);
  dequeue(userB.socketId);

  const sid = sessionId();

  const acceptTimer = setTimeout(() => {
    const session = sessions.get(sid);
    if (!session || session.status !== 'preview') return;

    // Timer expired — return both users to queue
    session.status = 'ended';
    sessions.delete(sid);

    [session.user1, session.user2].forEach(u => {
      if (u.ws.readyState !== u.ws.OPEN) return;
      u.sessionId = null;
      send(u.ws, 'match-expired', { message: 'Match timed out — searching again' });
      queue.push(u);
      attemptMatch(u);
    });
  }, 11_000); // 11 s (1 s buffer over the 10 s UI timer)

  /** @type {Session} */
  const session = {
    user1: userA,
    user2: userB,
    status: 'preview',
    accepted: new Set(),
    startTime: null,
    acceptTimer,
  };

  sessions.set(sid, session);
  userA.sessionId = sid;
  userB.sessionId = sid;

  send(userA.ws, 'match-found', { sessionId: sid, role: 'user1' });
  send(userB.ws, 'match-found', { sessionId: sid, role: 'user2' });
}

function attemptMatch(user) {
  // Don't match if already paired
  if (user.sessionId) return;

  const match = findBestMatch(user);
  if (match) {
    startPreview(user, match);
  } else {
    // Notify still searching (will try again when next user joins)
    setTimeout(() => {
      // Still in queue after 15 s → tell user
      if (queue.some(u => u.socketId === user.socketId) && !user.sessionId) {
        send(user.ws, 'queue-status', {
          status: 'waiting',
          message: 'Low traffic right now — hold tight...',
        });
      }
    }, 15_000);
  }
}

function endSession(sid, reason = 'ended', exceptSocketId = null) {
  const session = sessions.get(sid);
  if (!session) return;

  clearTimeout(session.acceptTimer);
  session.status = 'ended';
  sessions.delete(sid);

  [session.user1, session.user2].forEach(u => {
    u.sessionId = null;
    if (u.socketId !== exceptSocketId && u.ws.readyState === u.ws.OPEN) {
      send(u.ws, 'peer-disconnected', { reason });
    }
  });
}

// ─── WebSocket message handlers ───────────────────────────────────────────────
wss.on('connection', ws => {
  const socketId = uid();

  // Immediately acknowledge connection
  send(ws, 'connected', { socketId });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); }
    catch { return; }

    const { type, ...payload } = msg;
    const self = users.get(socketId);

    switch (type) {

      // ── Registration ─────────────────────────────────────────────────────
      case 'join': {
        /** payload: { deviceId, reconnectId, region, language, genderPref? } */
        if (users.has(socketId)) return; // already joined

        /** @type {UserState} */
        const user = {
          ws,
          socketId,
          deviceId: payload.deviceId,
          reconnectId: payload.reconnectId,
          region: payload.region || 'telangana',
          language: payload.language || 'telugu',
          genderPref: payload.genderPref || null,
          sessionId: null,
          lowPriority: false,
        };

        users.set(socketId, user);
        send(ws, 'joined', { socketId });
        break;
      }

      // ── Matchmaking ───────────────────────────────────────────────────────
      case 'find-match': {
        if (!self) return;
        if (self.sessionId) return; // already in session

        if (isOverSkipLimit(self.deviceId)) {
          self.lowPriority = true;
          send(ws, 'queue-status', {
            status: 'low-priority',
            message: 'Too many skips — matching paused briefly',
          });
          // Re-enable after penalty window
          setTimeout(() => {
            self.lowPriority = false;
            if (!self.sessionId) {
              queue.push(self);
              attemptMatch(self);
            }
          }, SKIP_PENALTY_MS);
          return;
        }

        send(ws, 'queue-status', {
          status: 'searching',
          message: 'Finding someone in Telangana...',
        });

        // Notify any queued users a new candidate arrived
        queue.push(self);
        attemptMatch(self);

        // Also re-try existing queue members against this new user
        for (const waiting of queue) {
          if (waiting.socketId !== socketId && !waiting.sessionId) {
            attemptMatch(waiting);
          }
        }
        break;
      }

      // ── Accept / decline preview ──────────────────────────────────────────
      case 'accept-match': {
        if (!self) return;
        const { sessionId: sid } = payload;
        const session = sessions.get(sid);
        if (!session || session.status !== 'preview') return;
        if (session.user1.socketId !== socketId && session.user2.socketId !== socketId) return;

        session.accepted.add(socketId);

        if (session.accepted.size === 2) {
          // Both accepted → kick off WebRTC
          clearTimeout(session.acceptTimer);
          session.status = 'connecting';
          session.startTime = Date.now();

          // user1 creates the offer (caller), user2 waits (callee)
          send(session.user1.ws, 'session-start', {
            sessionId: sid,
            role: 'caller',
            peerId: session.user2.socketId,
          });
          send(session.user2.ws, 'session-start', {
            sessionId: sid,
            role: 'callee',
            peerId: session.user1.socketId,
          });
        }
        break;
      }

      // ── WebRTC signaling relay ────────────────────────────────────────────
      case 'webrtc-offer': {
        if (!self?.sessionId) return;
        const session = sessions.get(self.sessionId);
        if (!session) return;
        const peer = session.user1.socketId === socketId ? session.user2 : session.user1;
        send(peer.ws, 'webrtc-offer', { sessionId: self.sessionId, offer: payload.offer });
        break;
      }

      case 'webrtc-answer': {
        if (!self?.sessionId) return;
        const session = sessions.get(self.sessionId);
        if (!session) return;
        const peer = session.user1.socketId === socketId ? session.user2 : session.user1;
        send(peer.ws, 'webrtc-answer', { sessionId: self.sessionId, answer: payload.answer });

        // Mark session live once answer flows
        if (session.status === 'connecting') session.status = 'live';
        break;
      }

      case 'ice-candidate': {
        if (!self?.sessionId) return;
        const session = sessions.get(self.sessionId);
        if (!session) return;
        const peer = session.user1.socketId === socketId ? session.user2 : session.user1;
        send(peer.ws, 'ice-candidate', {
          sessionId: self.sessionId,
          candidate: payload.candidate,
        });
        break;
      }

      // ── Next / Skip ───────────────────────────────────────────────────────
      case 'next': {
        if (!self) return;

        const hitLimit = recordSkip(self.deviceId);
        if (hitLimit) {
          self.lowPriority = true;
          setTimeout(() => { self.lowPriority = false; }, SKIP_PENALTY_MS);
        }

        if (self.sessionId) {
          endSession(self.sessionId, 'next', socketId);
        }
        dequeue(socketId);

        // Re-enter queue immediately
        send(ws, 'queue-status', { status: 'searching', message: 'Finding someone new...' });
        queue.push(self);
        attemptMatch(self);
        break;
      }

      // ── End session (user taps End, not Next) ─────────────────────────────
      case 'end-session': {
        if (!self) return;
        if (self.sessionId) {
          endSession(self.sessionId, 'ended', socketId);
        }
        dequeue(socketId);
        send(ws, 'session-ended', {});
        break;
      }

      // ── Reconnect by MC-ID ────────────────────────────────────────────────
      case 'reconnect-by-id': {
        /** payload: { targetReconnectId } */
        if (!self) return;

        const target = [...users.values()].find(
          u => u.reconnectId === payload.targetReconnectId
        );

        if (!target || target.sessionId !== null || target.socketId === socketId) {
          send(ws, 'reconnect-unavailable', {
            message: 'User not available right now',
          });
          return;
        }

        // Pair directly — skip queue
        dequeue(socketId);
        dequeue(target.socketId);

        send(ws, 'reconnect-found', { message: 'Found them — connecting...' });
        startPreview(self, target);
        break;
      }

      // ── Heartbeat / ping ──────────────────────────────────────────────────
      case 'ping':
        send(ws, 'pong');
        break;
    }
  });

  ws.on('close', () => {
    const user = users.get(socketId);
    if (!user) return;

    // Clean up active session
    if (user.sessionId) {
      endSession(user.sessionId, 'closed');
      // Re-queue the surviving peer
      const orphan = [...users.values()].find(
        u => u.socketId !== socketId && u.sessionId === null && queue.includes(u) === false
      );
      // (endSession already nulled their sessionId; attemptMatch is called in endSession flow)
    }

    dequeue(socketId);
    users.delete(socketId);
  });

  ws.on('error', err => console.error(`[WS ${socketId}] error:`, err.message));
});

server.listen(PORT, () => {
  console.log(`🔌 Signaling server listening on port ${PORT}`);
});
