# CommHub — Slack-like team chat

| Folder | Purpose |
|--------|---------|
| `commhub-backend/` | Node.js + Express + Socket.io + PostgreSQL API |
| `commhub-frontend/` | React + Vite + Tailwind web client |

## Quick start
See [DEPLOY.md](./DEPLOY.md) for Railway + Vercel deployment instructions.

## Local dev
```bash
# Backend
cd commhub-backend && cp .env.example .env && npm install && node src/migrate.js && npm run dev

# Frontend (new terminal)
cd commhub-frontend && cp .env.example .env && npm install && npm run dev
```
