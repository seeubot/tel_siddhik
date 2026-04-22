# Maya Connect — Backend Setup Guide

## Structure

```
maya-connect/
├── signaling-server/   → Koyeb Account 1  (WebSocket)
│   ├── index.js
│   └── package.json
├── api-server/         → Koyeb Account 2  (REST + MongoDB)
│   ├── index.js
│   └── package.json
├── frontend/
│   └── App.jsx         → Updated PWA frontend
└── .env.example
```

---

## 1. MongoDB Atlas (free tier)

1. Create a free cluster at https://cloud.mongodb.com
2. Create a database user with read/write access
3. Add `0.0.0.0/0` to the IP allowlist (Koyeb uses dynamic IPs)
4. Copy the connection string → `MONGODB_URI` in `api-server/.env`

The API server auto-creates all collections on first run via Mongoose.

---

## 2. Metered.ca TURN (free tier)

1. Sign up at https://www.metered.ca
2. Create an application → copy the TURN credentials
3. Add them to `frontend/.env` as `REACT_APP_TURN_*`

> **Why TURN is essential:** On Indian mobile networks (Jio, Airtel) with CGNAT,
> direct P2P WebRTC fails ~35% of the time. Without TURN, 1 in 3 calls will
> never connect.

---

## 3. Deploy Signaling Server → Koyeb Account 1

```bash
cd signaling-server
npm install
```

Koyeb config:
- **Build command:** `npm install`
- **Run command:**   `node index.js`
- **Port:**          `3001`
- **Env vars:**      `PORT=3001`

Add a CronJob at https://cron-job.org:
- URL: `https://your-signaling.koyeb.app/ping`
- Interval: every 5 minutes
- Method: GET

---

## 4. Deploy API Server → Koyeb Account 2

```bash
cd api-server
npm install
```

Koyeb config:
- **Build command:** `npm install`
- **Run command:**   `node index.js`
- **Port:**          `3002`
- **Env vars:**
  ```
  PORT=3002
  MONGODB_URI=<your atlas URI>
  FRONTEND_URL=https://your-pwa.koyeb.app
  ```

Add a second CronJob for this service URL too.

---

## 5. Frontend

Replace the old `App.jsx` with `frontend/App.jsx`.

Add to your `.env` (or equivalent for your build tool):
```
REACT_APP_SIGNALING_URL=wss://your-signaling.koyeb.app
REACT_APP_API_URL=https://your-api.koyeb.app
REACT_APP_TURN_URL=turn:relay.metered.ca:80
REACT_APP_TURN_USERNAME=...
REACT_APP_TURN_CREDENTIAL=...
```

> Use `wss://` (not `ws://`) and `https://` in production.

---

## WebSocket Events Reference

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ deviceId, reconnectId, region, language }` | Register on connect |
| `find-match` | — | Enter the matching queue |
| `accept-match` | `{ sessionId }` | Accept preview |
| `webrtc-offer` | `{ sessionId, offer }` | Relay SDP offer |
| `webrtc-answer` | `{ sessionId, answer }` | Relay SDP answer |
| `ice-candidate` | `{ sessionId, candidate }` | Relay ICE candidate |
| `next` | — | Skip current match, re-queue |
| `end-session` | — | End call, return to home |
| `reconnect-by-id` | `{ targetReconnectId }` | Direct match by MC-ID |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ socketId }` | WS connection confirmed |
| `joined` | `{ socketId }` | Registration accepted |
| `queue-status` | `{ status, message }` | Queue position update |
| `match-found` | `{ sessionId, role }` | Show blurred preview |
| `match-expired` | `{ message }` | 10 s timer expired |
| `session-start` | `{ sessionId, role }` | Both accepted — start WebRTC |
| `webrtc-offer` | `{ offer }` | Relayed offer from peer |
| `webrtc-answer` | `{ answer }` | Relayed answer from peer |
| `ice-candidate` | `{ candidate }` | Relayed ICE from peer |
| `peer-disconnected` | `{ reason }` | Peer left or disconnected |
| `session-ended` | — | Session closed cleanly |
| `reconnect-unavailable` | `{ message }` | MC-ID not found / offline |
| `rate-limited` | `{ message }` | Too many skips |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/users/register` | Register device, get reconnectId |
| `POST` | `/api/users/reset-id` | Generate new MC-ID |
| `GET`  | `/api/users/reconnect/:mcId` | Look up MC-ID availability |
| `GET`  | `/api/bans/check/:deviceId` | Check active ban |
| `POST` | `/api/reports` | Submit report → auto-bans |
| `POST` | `/api/blocks` | Block a device |
| `GET`  | `/api/blocks/:deviceId` | Get device's block list |
| `POST` | `/api/sessions` | Log session analytics |
| `GET`  | `/ping` | Health check (CronJob) |

---

## Ban Rules (auto-enforced on POST /api/reports)

| Trigger | Action | Duration |
|---------|--------|----------|
| 3 reports in 24 h | Temporary ban | 24 hours |
| 5 reports in 7 days | Temporary ban | 7 days |
| 10+ lifetime reports | Permanent ban | Forever |
| 20+ skips in 10 min | Lower match priority | 1 hour |
