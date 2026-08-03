#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# Zionite VPS Deployment Script
# Run on a fresh Ubuntu/Debian VPS as root or sudo user
# Usage: bash setup.sh
# ─────────────────────────────────────────────────────────────────────
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Zionite VPS Deployment Setup                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── Check prerequisites ────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root or with sudo"
  exit 1
fi

# ── Install Docker and Docker Compose ──────────────────────────────
echo "► Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✓ Docker installed"
else
  echo "✓ Docker already installed"
fi

if ! docker compose version &> /dev/null; then
  echo "► Installing Docker Compose plugin..."
  apt-get update && apt-get install -y docker-compose-plugin
  echo "✓ Docker Compose installed"
else
  echo "✓ Docker Compose already available"
fi

# ── Install FFmpeg (for non-Docker fallback) ───────────────────────
echo "► Installing FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
  apt-get update && apt-get install -y ffmpeg
  echo "✓ FFmpeg installed"
else
  echo "✓ FFmpeg already installed"
fi

# ── Create directory structure ─────────────────────────────────────
DEPLOY_DIR="/opt/zionite"
echo "► Setting up deployment directory at $DEPLOY_DIR..."
mkdir -p $DEPLOY_DIR/backups
mkdir -p $DEPLOY_DIR/nginx/conf.d

# ── Clone or update repository ─────────────────────────────────────
if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "► Updating existing repository..."
  cd $DEPLOY_DIR
  git pull origin master
else
  echo "► Cloning repository..."
  git clone https://github.com/KachiAlex/zionite.git $DEPLOY_DIR
  cd $DEPLOY_DIR
fi

# ── Copy deployment files ──────────────────────────────────────────
echo "► Setting up Docker Compose configuration..."
cp deploy/docker-compose.yml $DEPLOY_DIR/docker-compose.yml
cp deploy/Dockerfile $DEPLOY_DIR/Dockerfile
cp deploy/nginx/nginx.conf $DEPLOY_DIR/nginx/nginx.conf

# ── Create .env from example if it doesn't exist ───────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "► Creating .env file from template..."
  cp deploy/.env.example $DEPLOY_DIR/.env
  echo ""
  echo "⚠  IMPORTANT: Edit $DEPLOY_DIR/.env with your actual values before starting!"
  echo "   Required: POSTGRES_PASSWORD, JWT_SECRET, R2 keys, SMTP credentials"
  echo ""
  read -p "Have you edited the .env file? (y/n): " edited
  if [ "$edited" != "y" ] && [ "$edited" != "Y" ]; then
    echo "Please edit $DEPLOY_DIR/.env and re-run this script."
    exit 1
  fi
fi

# ── Load environment variables ─────────────────────────────────────
source $DEPLOY_DIR/.env

# ── Build and start services ───────────────────────────────────────
echo "► Building and starting Docker containers..."
cd $DEPLOY_DIR
docker compose build
docker compose up -d

echo "► Waiting for PostgreSQL to be ready..."
sleep 10

# ── Check if we need to migrate data from Neon ─────────────────────
echo ""
echo "── Database Migration ──"
echo "If you have an existing Neon database, you can migrate data now."
echo "Make sure you have your Neon connection string ready."
echo ""
read -p "Do you want to migrate data from Neon? (y/n): " migrate
if [ "$migrate" = "y" ] || [ "$migrate" = "Y" ]; then
  read -p "Enter your Neon connection string (postgres://...): " neon_url
  if [ -n "$neon_url" ]; then
    echo "► Dumping database from Neon..."
    pg_dump "$neon_url" --no-owner --no-privileges -F p -f $DEPLOY_DIR/backups/neon_dump.sql
    
    echo "► Importing to local PostgreSQL..."
    docker compose exec -T db psql -U ${POSTGRES_USER:-zionite} -d ${POSTGRES_DB:-zionite} < $DEPLOY_DIR/backups/neon_dump.sql
    
    echo "✓ Database migration complete!"
  else
    echo "No Neon URL provided, skipping migration."
  fi
else
  echo "Skipping migration. The app will auto-create schema on first start."
fi

# ── Set up SSL with Let's Encrypt ──────────────────────────────────
echo ""
echo "── SSL Certificate ──"
echo "To enable HTTPS, you need a domain pointing to this server."
read -p "Enter your domain (e.g., api.zionite.online): " domain
if [ -n "$domain" ]; then
  echo "► Getting SSL certificate for $domain..."
  
  # Get certificate using certbot standalone
  docker run -it --rm \
    -v $DEPLOY_DIR/certbot-etc:/etc/letsencrypt \
    -v $DEPLOY_DIR/certbot-var:/var/lib/letsencrypt \
    -v $DEPLOY_DIR/web-root:/var/www/certbot \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    --email admin@zionite.online --agree-tos --no-eff-email \
    -d $domain

  # Enable HTTPS in nginx config
  echo "► Enabling HTTPS in Nginx config..."
  sed -i "s/your-domain.com/$domain/g" $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/# location \/ {/location \//g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     return 301/    return 301/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/# server {/server {/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     listen 443/    listen 443/g' $DEPLOY_DIR/nginx/nginx.conf
  
  # Reload nginx
  docker compose restart nginx
  echo "✓ SSL configured for $domain"
else
  echo "Skipping SSL. App will run on HTTP only."
fi

# ── Set up automatic backups ───────────────────────────────────────
echo "► Setting up daily database backups..."
cat > /etc/cron.d/zionite-backup << 'EOF'
0 3 * * * root cd /opt/zionite && docker compose exec -T db pg_dump -U zionite zionite > /opt/zionite/backups/backup_$(date +\%Y\%m\%d).sql 2>/dev/null && find /opt/zionite/backups -name "backup_*.sql" -mtime +7 -delete
EOF
chmod 644 /etc/cron.d/zionite-backup
echo "✓ Daily backups at 3 AM configured (7-day retention)"

# ── Final status ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Deployment Complete!                                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Services running:                                           ║"
echo "║    • PostgreSQL  — port 5432 (internal)                      ║"
echo "║    • Backend API — port 3000 (via Nginx)                     ║"
echo "║    • Nginx       — port 80/443                               ║"
echo "║                                                              ║"
echo "║  Useful commands:                                            ║"
echo "║    cd /opt/zionite                                           ║"
echo "║    docker compose logs -f backend   # view logs              ║"
echo "║    docker compose restart backend  # restart                 ║"
echo "║    docker compose down             # stop all                ║"
echo "║    docker compose up -d            # start all               ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
