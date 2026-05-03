'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * gender.js — Orey! Gender-Aware Matchmaking Module (v2)
 *
 * Exports a factory function that returns a GenderMatcher instance.
 * The main server imports this and delegates all gender-queue logic here.
 *
 * Match priority:
 *   1. Opposite gender (male ↔ female)
 *   2. Same gender queue (any willing peer)
 *   3. Falls through to the caller to use the default random queue
 *
 * NEW: 3-Second Timer Support
 *   - trackTimer(socketId, gender) → starts a 3s countdown
 *   - isTimerExpired(socketId) → true after 3s
 *   - Clients can call findMatch first for gender, then fall back
 *
 * Valid gender values: 'male' | 'female' | null (unset / prefer not to say)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VALID_GENDERS = new Set(['male', 'female']);
const GENDER_TIMEOUT_MS = 3000; // 3 seconds priority window

/**
 * Returns a GenderMatcher instance.
 * @param {import('socket.io').Server} io  — the Socket.IO server instance
 */
function createGenderMatcher(io) {

  /**
   * Gendered waiting queues.
   * Each entry: { socketId: string, gender: 'male'|'female'|null, joinedAt: number }
   */
  const maleQueue   = [];
  const femaleQueue = [];

  /**
   * Timer tracking: socketId → { gender, startedAt, expired: boolean }
   */
  const timerMap = new Map();

  /* ── Helpers ── */

  function _remove(queue, socketId) {
    const idx = queue.findIndex(e => e.socketId === socketId);
    if (idx !== -1) queue.splice(idx, 1);
  }

  function _find(queue, socketId) {
    return queue.find(e => e.socketId === socketId);
  }

  function _opposite(gender) {
    if (gender === 'male')   return 'female';
    if (gender === 'female') return 'male';
    return null;
  }

  function _queueFor(gender) {
    if (gender === 'male')   return maleQueue;
    if (gender === 'female') return femaleQueue;
    return null;
  }

  function _popFirst(queue) {
    return queue.length > 0 ? queue.shift() : null;
  }

  function _isSocketAlive(socketId) {
    return !!io.sockets.sockets.get(socketId);
  }

  /**
   * Drain dead sockets from both queues (called opportunistically).
   */
  function _cleanQueues() {
    for (let i = maleQueue.length - 1; i >= 0; i--) {
      if (!_isSocketAlive(maleQueue[i].socketId)) maleQueue.splice(i, 1);
    }
    for (let i = femaleQueue.length - 1; i >= 0; i--) {
      if (!_isSocketAlive(femaleQueue[i].socketId)) femaleQueue.splice(i, 1);
    }
  }

  /**
   * Clean expired timers.
   */
  function _cleanTimers() {
    const now = Date.now();
    for (const [socketId, timer] of timerMap.entries()) {
      if (now - timer.startedAt >= GENDER_TIMEOUT_MS) {
        timer.expired = true;
      }
      if (!_isSocketAlive(socketId)) {
        timerMap.delete(socketId);
      }
    }
  }

  /* ── Public API ── */

  /**
   * Validate and normalise a raw gender string.
   * Returns 'male' | 'female' | null.
   */
  function normalise(raw) {
    if (!raw) return null;
    const s = String(raw).trim().toLowerCase();
    return VALID_GENDERS.has(s) ? s : null;
  }

  /**
   * Add a socket to the gender queue.
   * Removes any existing entry for the same socket first (idempotent).
   *
   * @param {string} socketId
   * @param {'male'|'female'|null} gender
   */
  function enqueue(socketId, gender) {
    _remove(maleQueue, socketId);
    _remove(femaleQueue, socketId);

    const q = _queueFor(gender);
    if (q) {
      q.push({ socketId, gender, joinedAt: Date.now() });
    }
  }

  /**
   * Remove a socket from all gender queues.
   */
  function dequeue(socketId) {
    _remove(maleQueue, socketId);
    _remove(femaleQueue, socketId);
    timerMap.delete(socketId);
  }

  /**
   * 🆕 Start the 3-second gender priority timer for a socket.
   * The timer expires after GENDER_TIMEOUT_MS (3 seconds).
   *
   * @param {string} socketId
   * @param {'male'|'female'} gender
   */
  function startTimer(socketId, gender) {
    timerMap.set(socketId, {
      gender,
      startedAt: Date.now(),
      expired: false
    });

    // Auto-expire after timeout
    setTimeout(() => {
      const timer = timerMap.get(socketId);
      if (timer) {
        timer.expired = true;
      }
    }, GENDER_TIMEOUT_MS);
  }

  /**
   * 🆕 Check if the gender priority timer has expired for a socket.
   * Returns true if:
   *   - Timer was started and 3 seconds have passed
   *   - No timer was ever started (should use random queue)
   *
   * @param {string} socketId
   * @returns {boolean}
   */
  function isTimerExpired(socketId) {
    _cleanTimers();
    const timer = timerMap.get(socketId);
    if (!timer) return true; // No timer = use random
    return timer.expired;
  }

  /**
   * 🆕 Get remaining time in seconds for the gender timer.
   *
   * @param {string} socketId
   * @returns {number} seconds remaining (0 if expired)
   */
  function getTimerRemaining(socketId) {
    const timer = timerMap.get(socketId);
    if (!timer || timer.expired) return 0;
    const elapsed = Date.now() - timer.startedAt;
    const remaining = Math.max(0, GENDER_TIMEOUT_MS - elapsed);
    return Math.ceil(remaining / 1000);
  }

  /**
   * 🆕 Find a match considering the 3-second timer.
   *
   * - If timer is active (not expired): try opposite gender only
   * - If timer expired or no timer: try opposite, then same, then null
   *
   * @param {string} socketId
   * @param {'male'|'female'|null} gender
   * @returns {{ socketId: string, gender: string|null } | null}
   */
  function findMatch(socketId, gender) {
    _cleanQueues();
    _cleanTimers();

    _remove(maleQueue, socketId);
    _remove(femaleQueue, socketId);

    const timerExpired = isTimerExpired(socketId);
    const opposite = _opposite(gender);

    // ── Priority 1: Opposite gender (always tried first if gender is set) ──
    if (opposite) {
      const oppQ = _queueFor(opposite);
      while (oppQ.length > 0) {
        const candidate = _popFirst(oppQ);
        if (candidate.socketId === socketId) continue;
        if (!_isSocketAlive(candidate.socketId)) continue;

        // 🆕 If timer is NOT expired, check candidate's timer too
        if (!timerExpired) {
          const candidateTimerExpired = isTimerExpired(candidate.socketId);
          if (!candidateTimerExpired) {
            // Both have active timers — perfect match!
            timerMap.delete(socketId);
            timerMap.delete(candidate.socketId);
            return candidate;
          }
          // Candidate's timer expired, but they're still in opposite queue
          // Accept them anyway (they're what we want)
          timerMap.delete(socketId);
          return candidate;
        }

        // Timer expired — accept any opposite gender
        timerMap.delete(socketId);
        return candidate;
      }
    }

    // ── Priority 2: Same gender (only if timer expired or no timer) ──
    if (timerExpired && gender) {
      const sameQ = _queueFor(gender);
      if (sameQ) {
        while (sameQ.length > 0) {
          const candidate = _popFirst(sameQ);
          if (candidate.socketId === socketId) continue;
          if (!_isSocketAlive(candidate.socketId)) continue;
          timerMap.delete(socketId);
          return candidate;
        }
      }
    }

    // ── Priority 3: No gender match ──
    return null;
  }

  /**
   * Check whether a socket is currently in any gender queue.
   */
  function isQueued(socketId) {
    return (
      maleQueue.some(e   => e.socketId === socketId) ||
      femaleQueue.some(e => e.socketId === socketId)
    );
  }

  /**
   * Diagnostic stats (useful for admin endpoints / logging).
   */
  function stats() {
    _cleanQueues();
    _cleanTimers();
    return {
      maleWaiting:   maleQueue.length,
      femaleWaiting: femaleQueue.length,
      totalWaiting:  maleQueue.length + femaleQueue.length,
      activeTimers:  timerMap.size,
      expiredTimers: [...timerMap.values()].filter(t => t.expired).length,
    };
  }

  return {
    normalise,
    enqueue,
    dequeue,
    findMatch,
    isQueued,
    stats,
    // 🆕 Timer API
    startTimer,
    isTimerExpired,
    getTimerRemaining,
  };
}

module.exports = createGenderMatcher;
