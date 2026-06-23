# CommHub — Deploy to Railway (backend) + Vercel (frontend)

Estimated time: **20–30 minutes**

---

## What you're deploying

```
commhub-backend/   → Railway  (Node + Socket.io + PostgreSQL)
commhub-frontend/  → Vercel   (React + Vite)
```

---

## Step 1 — Push both folders to GitHub

Create **two separate GitHub repos** (or a monorepo with two folders — both work).

```bash
# Option A: two repos
cd commhub-backend  && git init && git add . && git commit -m "init" && gh repo create commhub-backend --public --source=. --push
cd commhub-frontend && git init && git add . && git commit -m "init" && gh repo create commhub-frontend --public --source=. --push

# Option B: one repo
git init commhub && cd commhub
cp -r commhub-backend commhub-frontend .
git add . && git commit -m "init"
gh repo create commhub --public --source=. --push
```

> Don't have `gh`? Create the repos at github.com, then `git remote add origin <url> && git push`.

---

## Step 2 — Deploy the backend on Railway

### 2a. Create a Railway account
Go to **railway.app** → click **Start a New Project** → sign in with GitHub.

### 2b. Create a new project
- Click **New Project → Deploy from GitHub repo**
- Select your `commhub-backend` repo (or set the root directory to `commhub-backend/` if using a monorepo)
- Railway auto-detects Node.js from `package.json`. Click **Deploy**.

### 2c. Add a PostgreSQL database
- In your project dashboard, click **+ New → Database → Add PostgreSQL**
- Railway creates a Postgres instance and automatically sets `DATABASE_URL` in your backend's environment.

### 2d. Run the database migration
- Go to your backend service → **Settings → Deploy** section
- Under **Start Command**, change to:
  ```
  node src/migrate.js && node src/index.js
  ```
  This runs the schema migration on every deploy (safe to run multiple times — uses `IF NOT EXISTS`).

### 2e. Add environment variables
In your backend service → **Variables** tab, add:

| Key | Value |
|-----|-------|
| `JWT_SECRET` | A long random string — generate one with `openssl rand -hex 32` |
| `FRONTEND_URL` | `https://your-app.vercel.app` ← fill in after Step 3 |
| `PORT` | (leave blank — Railway sets this automatically) |

> `DATABASE_URL` is already set by Railway's Postgres plugin. Do not change it.

### 2f. Get your backend URL
- Click your backend service → **Settings → Networking → Generate Domain**
- You'll get something like `commhub-backend-production.up.railway.app`
- **Copy this URL** — you need it in Step 3.

---

## Step 3 — Deploy the frontend on Vercel

### 3a. Create a Vercel account
Go to **vercel.com** → sign in with GitHub.

### 3b. Import the frontend repo
- Click **Add New → Project**
- Import your `commhub-frontend` repo
- Vercel auto-detects **Vite**. Keep default settings.

### 3c. Add environment variable
Before clicking Deploy, expand **Environment Variables** and add:

| Key | Value |
|-----|-------|
| `VITE_API_URL` | `https://commhub-backend-production.up.railway.app` ← your Railway URL from Step 2f |

### 3d. Deploy
Click **Deploy**. Vercel builds and gives you a URL like `commhub.vercel.app`.

---

## Step 4 — Final wiring

### Update FRONTEND_URL in Railway
- Go back to Railway → your backend service → **Variables**
- Update `FRONTEND_URL` to your Vercel URL (e.g. `https://commhub.vercel.app`)
- Railway auto-redeploys.

### Verify
1. Open your Vercel URL
2. Sign up for an account
3. You should land in `#general`
4. Share the URL with your team — they sign up and start chatting

---

## Step 5 — Invite your team

Just share your Vercel URL (e.g. `https://commhub.vercel.app`). Everyone creates their own account — they're automatically added to all public channels.

---

## Local development (optional)

### Backend
```bash
cd commhub-backend
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET
npm install
node src/migrate.js         # create tables
npm run dev                 # starts on :3001 with hot-reload
```

### Frontend
```bash
cd commhub-frontend
cp .env.example .env        # set VITE_API_URL=http://localhost:3001
npm install
npm run dev                 # starts on :5173
```

Open `http://localhost:5173` — the Vite proxy forwards `/api` and `/socket.io` to the backend automatically.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot connect to database` | Check `DATABASE_URL` in Railway env vars — should be set automatically by the Postgres plugin |
| CORS error in browser | Make sure `FRONTEND_URL` in Railway exactly matches your Vercel domain (no trailing slash) |
| Socket not connecting | Vercel doesn't support WebSockets on its own domain. The frontend connects to the Railway URL directly — confirm `VITE_API_URL` is set correctly |
| `JWT_SECRET` error | Add a strong secret (32+ chars) in Railway env vars |
| Migration fails | Check Railway logs → `node src/migrate.js` output. The `uuid-ossp` extension requires Postgres 13+ — Railway provides this by default |

---

## Scaling up

- **Custom domain**: Railway and Vercel both support custom domains in their Settings → Domains panels
- **Multiple workspaces**: The schema supports it — add a `workspace_id` column to `channels` and filter by it
- **File uploads**: Add AWS S3 or Cloudflare R2 and a `POST /api/files` endpoint  
- **WebRTC calls**: Add LiveKit to Railway as a separate service and wire the call buttons  
- **Email invites**: Add Resend or SendGrid and a `POST /api/auth/invite` endpoint

---

Railway free tier: **$5/month** (includes Postgres)  
Vercel free tier: **$0** (more than enough for a team)

Total cost for a 10-person team: **~$5/month**
