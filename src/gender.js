'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * gender.js — Orey! Gender-Aware Matchmaking Module
 *
 * Exports a factory function that returns a GenderMatcher instance.
 * The main server imports this and delegates all gender-queue logic here.
 *
 * Match priority:
 *   1. Opposite gender (male ↔ female)
 *   2. Any available peer if no opposite found
 *   3. Falls through to the caller to use the default random queue
 *
 * Valid gender values: 'male' | 'female' | null (unset / prefer not to say)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VALID_GENDERS = new Set(['male', 'female']);

/**
 * Returns a GenderMatcher instance.
 * @param {import('socket.io').Server} io  — the Socket.IO server instance
 */
function createGenderMatcher(io) {

  /**
   * Gendered waiting queues.
   * Each entry: { socketId: string, gender: 'male'|'female'|null }
   */
  const maleQueue   = [];   // waiting males
  const femaleQueue = [];   // waiting females

  /* ── Helpers ── */

  function _remove(queue, socketId) {
    const idx = queue.findIndex(e => e.socketId === socketId);
    if (idx !== -1) queue.splice(idx, 1);
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
    // Always clean stale entries first
    _remove(maleQueue, socketId);
    _remove(femaleQueue, socketId);

    const q = _queueFor(gender);
    if (q) {
      q.push({ socketId, gender });
    }
    // If gender is null the socket stays out of gender queues;
    // the caller should put it in the plain randomQueue instead.
  }

  /**
   * Remove a socket from all gender queues.
   */
  function dequeue(socketId) {
    _remove(maleQueue, socketId);
    _remove(femaleQueue, socketId);
  }

  /**
   * Try to find the best match for a socket.
   *
   * Priority:
   *   1. Opposite gender queue (non-empty)
   *   2. Same gender queue (if opposite empty)
   *   3. null → no gender match available; caller falls back to plain queue
   *
   * @param {string} socketId
   * @param {'male'|'female'|null} gender
   * @returns {{ socketId: string, gender: string|null } | null}
   */
  function findMatch(socketId, gender) {
    _cleanQueues();

    // Remove self from any queue so we don't match with ourselves
    _remove(maleQueue, socketId);
    _remove(femaleQueue, socketId);

    const opposite = _opposite(gender);

    // 1. Try opposite gender
    if (opposite) {
      const oppQ = _queueFor(opposite);
      while (oppQ.length > 0) {
        const candidate = _popFirst(oppQ);
        if (candidate.socketId === socketId) continue;     // skip self (safety)
        if (!_isSocketAlive(candidate.socketId)) continue; // skip dead sockets
        return candidate;
      }
    }

    // 2. Try same gender (any willing peer)
    const sameQ = _queueFor(gender);
    if (sameQ) {
      while (sameQ.length > 0) {
        const candidate = _popFirst(sameQ);
        if (candidate.socketId === socketId) continue;
        if (!_isSocketAlive(candidate.socketId)) continue;
        return candidate;
      }
    }

    // 3. No gender match found
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
    return {
      maleWaiting:   maleQueue.length,
      femaleWaiting: femaleQueue.length,
      totalWaiting:  maleQueue.length + femaleQueue.length,
    };
  }

  return { normalise, enqueue, dequeue, findMatch, isQueued, stats };
}

module.exports = createGenderMatcher;
