# Zionite VPS Deployment Guide

Complete migration from Fly.io + Neon to a self-hosted VPS (Contabo, DigitalOcean, etc.)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   VPS Server                     │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Nginx    │→ │ Backend   │→ │ PostgreSQL   │  │
│  │ (SSL)    │  │ (Node.js) │  │ (Docker)     │  │
│  │ :80/:443 │  │ :3000     │  │ :5432        │  │
│  └──────────┘  │ + FFmpeg  │  └──────────────┘  │
│                └───────────┘                     │
└─────────────────────────────────────────────────┘

External services (stay as-is):
  • Frontend → Vercel (https://www.zionite.online)
  • R2 Storage → Cloudflare R2 + Worker
  • Push Notifications → Firebase
  • Email → Brevo SMTP
```

## Prerequisites

- Fresh Ubuntu 22.04/24.04 or Debian 12 VPS
- Root or sudo access
- Domain name pointing to your VPS IP (for SSL)
- Your existing environment variables (from Fly.io and Neon)

## Quick Start

### 1. SSH into your VPS
```bash
ssh root@your-vps-ip
```

### 2. Clone the repo and run setup
```bash
git clone https://github.com/KachiAlex/zionite.git /opt/zionite
cd /opt/zionite/deploy
bash setup.sh
```

The script will:
- Install Docker and Docker Compose
- Install FFmpeg
- Build and start all containers (PostgreSQL + Backend + Nginx)
- Optionally migrate data from Neon
- Optionally set up SSL with Let's Encrypt
- Set up daily database backups

### 3. Edit .env file
Before starting containers, edit `/opt/zionite/.env` with your actual values:

```bash
nano /opt/zionite/.env
```

**Required values:**
- `POSTGRES_PASSWORD` — strong password for local PostgreSQL
- `JWT_SECRET` — random 64+ character string (use `openssl rand -hex 32`)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — from Cloudflare
- `SMTP_USER`, `SMTP_PASS` — from Brevo
- `FIREBASE_*` — from Firebase console
- `VAPID_*` — web push keys

### 4. Migrate existing database (optional)
If you have data on Neon, migrate it:

```bash
cd /opt/zionite/deploy
bash migrate-db.sh "postgres://user:pass@neon-host/neondb"
```

### 5. Update frontend to point to VPS
Update `frontend/src/lib/api.ts` to point to your VPS domain:

```typescript
export const API_BASE = 'https://api.yourdomain.com'
export const STREAM_BASE = 'https://api.yourdomain.com'
export const SOCKET_BASE = 'https://api.yourdomain.com'
```

Then rebuild and redeploy the frontend:
```bash
cd frontend
npm run build
npx vercel --prod --yes
```

## Manual Deployment (without setup.sh)

### Start services
```bash
cd /opt/zionite
docker compose up -d
```

### View logs
```bash
docker compose logs -f backend
```

### Restart backend
```bash
docker compose restart backend
```

### Stop all services
```bash
docker compose down
```

## SSL Certificate

### Initial setup
```bash
# Get certificate
docker run -it --rm \
  -v /opt/zionite/certbot-etc:/etc/letsencrypt \
  -v /opt/zionite/certbot-var:/var/lib/letsencrypt \
  -v /opt/zionite/web-root:/var/www/certbot \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  --email admin@zionite.online --agree-tos --no-eff-email \
  -d api.yourdomain.com

# Uncomment HTTPS block in nginx.conf
nano /opt/zionite/nginx/nginx.conf

# Restart nginx
docker compose restart nginx
```

### Auto-renewal
Certbot container auto-renews every 12 hours. No action needed.

## Backups

### Automatic
Daily backup at 3 AM, 7-day retention:
```bash
/opt/zionite/backups/backup_YYYYMMDD.sql
```

### Manual backup
```bash
cd /opt/zionite
docker compose exec db pg_dump -U zionite zionite > backups/manual_backup_$(date +%Y%m%d).sql
```

### Restore from backup
```bash
cd /opt/zionite
docker compose exec -T db psql -U zionite zionite < backups/backup_YYYYMMDD.sql
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `POSTGRES_DB` | Database name | Yes |
| `POSTGRES_USER` | Database user | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `FRONTEND_URL` | Frontend URL for CORS/emails | Yes |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Yes |
| `R2_ACCESS_KEY_ID` | R2 access key | Yes |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | Yes |
| `R2_BUCKET` | R2 bucket name | Yes |
| `R2_PUBLIC_URL` | R2 public CDN URL | Yes |
| `R2_WORKER_URL` | R2 upload worker URL | Yes |
| `SMTP_HOST` | SMTP server host | Yes |
| `SMTP_PORT` | SMTP port | Yes |
| `SMTP_USER` | SMTP username | Yes |
| `SMTP_PASS` | SMTP password | Yes |
| `FROM_EMAIL` | Sender email | Yes |
| `FIREBASE_PROJECT_ID` | Firebase project ID | No* |
| `FIREBASE_CLIENT_EMAIL` | Firebase client email | No* |
| `FIREBASE_PRIVATE_KEY` | Firebase private key | No* |
| `VAPID_PUBLIC_KEY` | Web push public key | No* |
| `VAPID_PRIVATE_KEY` | Web push private key | No* |
| `SENTRY_DSN` | Sentry error tracking | No |

*Required for push notifications

## Updating the App

```bash
cd /opt/zionite
git pull origin master
docker compose build backend
docker compose up -d backend
```

## Troubleshooting

### Backend won't start
```bash
docker compose logs backend
```
Common issues:
- Missing env vars → check `.env` file
- DB not ready → wait 30s and restart: `docker compose restart backend`

### FFmpeg not found
FFmpeg is installed inside the Docker image. If running outside Docker:
```bash
apt install ffmpeg
```

### WebSocket connections failing
Ensure Nginx is configured with WebSocket upgrade headers (already in nginx.conf).

### HLS streams not playing
Check that `HLS_DIR` is set and the directory is writable:
```bash
docker compose exec backend ls -la /tmp/hls/
```
