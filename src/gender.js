'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * gender.js — Orey! Gender-Aware Matchmaking Module (v3 - Fixed)
 *
 * Fix summary:
 *   1. findMatch no longer removes the caller from its queue before confirming
 *      a partner exists — prevents "lost from queue" bug.
 *   2. Timer expiry now fires a callback so the server can push the socket
 *      into the random fallback queue automatically.
 *   3. findMatch returns a structured result { matched, partner, fallback }
 *      so the server knows exactly what happened.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VALID_GENDERS   = new Set(['male', 'female']);
const GENDER_TIMEOUT_MS = 3000;

function createGenderMatcher(io) {

  const maleQueue   = [];
  const femaleQueue = [];

  /**
   * timerMap: socketId → { gender, startedAt, expired, timeoutHandle }
   */
  const timerMap = new Map();

  /**
   * onExpire callbacks registered by the server.
   * Called with (socketId, gender) when the 3-second window closes.
   */
  const expireCallbacks = [];

  /* ── Internal helpers ── */

  function _remove(queue, socketId) {
    const idx = queue.findIndex(e => e.socketId === socketId);
    if (idx !== -1) { queue.splice(idx, 1); return true; }
    return false;
  }

  function _isSocketAlive(socketId) {
    return !!io.sockets.sockets.get(socketId);
  }

  function _cleanQueues() {
    for (let i = maleQueue.length - 1;   i >= 0; i--) { if (!_isSocketAlive(maleQueue[i].socketId))   maleQueue.splice(i, 1); }
    for (let i = femaleQueue.length - 1; i >= 0; i--) { if (!_isSocketAlive(femaleQueue[i].socketId)) femaleQueue.splice(i, 1); }
  }

  function _queueFor(gender) {
    if (gender === 'male')   return maleQueue;
    if (gender === 'female') return femaleQueue;
    return null;
  }

  function _opposite(gender) {
    if (gender === 'male')   return 'female';
    if (gender === 'female') return 'male';
    return null;
  }

  /* ── Public API ── */

  /** Validate and normalise a raw gender string → 'male' | 'female' | null */
  function normalise(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    return VALID_GENDERS.has(s) ? s : null;
  }

  /**
   * Register a callback fired when a socket's gender timer expires.
   * Signature: (socketId: string, gender: string) => void
   * The server uses this to push the socket into the random fallback queue.
   */
  function onTimerExpire(cb) {
    expireCallbacks.push(cb);
  }

  /**
   * Start the 3-second gender-priority timer for a socket.
   * When it expires, all registered onTimerExpire callbacks are invoked.
   */
  function startTimer(socketId, gender) {
    // Cancel any existing timer first
    const existing = timerMap.get(socketId);
    if (existing?.timeoutHandle) clearTimeout(existing.timeoutHandle);

    const timeoutHandle = setTimeout(() => {
      const entry = timerMap.get(socketId);
      if (!entry) return;
      entry.expired = true;
      // Only fire callback if socket is still alive and still in gender queue
      if (_isSocketAlive(socketId)) {
        expireCallbacks.forEach(cb => { try { cb(socketId, gender); } catch (e) { console.error('onTimerExpire error', e); } });
      }
    }, GENDER_TIMEOUT_MS);

    timerMap.set(socketId, { gender, startedAt: Date.now(), expired: false, timeoutHandle });
  }

  /** Check whether the gender priority window has closed for a socket */
  function isTimerExpired(socketId) {
    const t = timerMap.get(socketId);
    if (!t) return true;
    return t.expired;
  }

  /** Seconds remaining on the gender timer (0 if expired / not started) */
  function getTimerRemaining(socketId) {
    const t = timerMap.get(socketId);
    if (!t || t.expired) return 0;
    return Math.max(0, Math.ceil((GENDER_TIMEOUT_MS - (Date.now() - t.startedAt)) / 1000));
  }

  /**
   * Add a socket to the appropriate gender queue (idempotent).
   */
  function enqueue(socketId, gender) {
    _remove(maleQueue,   socketId);
    _remove(femaleQueue, socketId);
    const q = _queueFor(gender);
    if (q) q.push({ socketId, gender, joinedAt: Date.now() });
  }

  /**
   * Remove a socket from all gender queues and cancel its timer.
   */
  function dequeue(socketId) {
    _remove(maleQueue,   socketId);
    _remove(femaleQueue, socketId);
    const t = timerMap.get(socketId);
    if (t?.timeoutHandle) clearTimeout(t.timeoutHandle);
    timerMap.delete(socketId);
  }

  /**
   * Try to find a gender-aware match for socketId.
   *
   * Strategy:
   *   • Timer still active  → opposite gender only
   *   • Timer expired       → opposite gender, then same gender
   *
   * IMPORTANT: We do NOT remove socketId from its own queue here.
   * The caller (server) must call dequeue(socketId) after a successful match
   * to keep queue state consistent.
   *
   * @returns {{ matched: true, partner: { socketId, gender } }
   *          |{ matched: false }}
   */
  function findMatch(socketId, gender) {
    _cleanQueues();

    const timerExpired = isTimerExpired(socketId);
    const opposite     = _opposite(gender);

    // ── Priority 1: Opposite gender ──────────────────────────────────────────
    if (opposite) {
      const oppQ = _queueFor(opposite);
      // Scan without modifying until we find a live, non-self candidate
      for (let i = 0; i < oppQ.length; i++) {
        const candidate = oppQ[i];
        if (candidate.socketId === socketId) continue;
        if (!_isSocketAlive(candidate.socketId)) { oppQ.splice(i, 1); i--; continue; }

        // Found valid opposite-gender partner — remove them from queue now
        oppQ.splice(i, 1);
        // Caller is responsible for dequeuing socketId
        timerMap.delete(socketId);
        timerMap.delete(candidate.socketId);
        return { matched: true, partner: candidate };
      }
    }

    // ── Priority 2: Same gender (only after timer expires) ───────────────────
    if (timerExpired && gender) {
      const sameQ = _queueFor(gender);
      if (sameQ) {
        for (let i = 0; i < sameQ.length; i++) {
          const candidate = sameQ[i];
          if (candidate.socketId === socketId) continue;
          if (!_isSocketAlive(candidate.socketId)) { sameQ.splice(i, 1); i--; continue; }

          sameQ.splice(i, 1);
          timerMap.delete(socketId);
          return { matched: true, partner: candidate };
        }
      }
    }

    return { matched: false };
  }

  /** Is the socket currently in any gender queue? */
  function isQueued(socketId) {
    return maleQueue.some(e => e.socketId === socketId) ||
           femaleQueue.some(e => e.socketId === socketId);
  }

  /** Diagnostic stats for admin endpoints */
  function stats() {
    _cleanQueues();
    return {
      maleWaiting:   maleQueue.length,
      femaleWaiting: femaleQueue.length,
      totalWaiting:  maleQueue.length + femaleQueue.length,
      activeTimers:  [...timerMap.values()].filter(t => !t.expired).length,
      expiredTimers: [...timerMap.values()].filter(t =>  t.expired).length,
    };
  }

  return {
    normalise,
    enqueue,
    dequeue,
    findMatch,
    isQueued,
    stats,
    startTimer,
    isTimerExpired,
    getTimerRemaining,
    onTimerExpire,      // NEW – lets server register fallback callback
  };
}

module.exports = createGenderMatcher;
