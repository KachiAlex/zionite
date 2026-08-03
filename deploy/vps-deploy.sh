#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# Zionite VPS Deployment — All-in-one script for InterServer VPS
# Run as root on the VPS: bash vps-deploy.sh
# ─────────────────────────────────────────────────────────────────────
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Zionite VPS Deployment — InterServer                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"

# ── Check root ─────────────────────────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root"
  exit 1
fi

# ── Install Docker ─────────────────────────────────────────────────
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
  apt-get update && apt-get install -y docker-compose-plugin
  echo "✓ Docker Compose installed"
else
  echo "✓ Docker Compose already available"
fi

# ── Install FFmpeg and other tools ─────────────────────────────────
echo "► Installing system packages..."
apt-get update
apt-get install -y ffmpeg git curl wget postgresql-client
echo "✓ System packages installed"

# ── Clone repository ───────────────────────────────────────────────
DEPLOY_DIR="/opt/zionite"
echo "► Setting up deployment at $DEPLOY_DIR..."
if [ -d "$DEPLOY_DIR/.git" ]; then
  cd $DEPLOY_DIR
  git pull origin master
else
  git clone https://github.com/KachiAlex/zionite.git $DEPLOY_DIR
  cd $DEPLOY_DIR
fi

# ── Create .env from example ───────────────────────────────────────
if [ ! -f "$DEPLOY_DIR/.env" ]; then
  echo "► Creating .env file..."
  cp deploy/.env.example $DEPLOY_DIR/.env

  # Generate secure defaults
  JWT_SECRET=$(openssl rand -hex 32)
  PG_PASS=$(openssl rand -hex 16)

  sed -i "s/CHANGE_ME_to_a_strong_password/$PG_PASS/g" $DEPLOY_DIR/.env
  sed -i "s/CHANGE_ME_to_a_random_64_char_string/$JWT_SECRET/g" $DEPLOY_DIR/.env

  echo "✓ .env created with generated secrets"
  echo "  PostgreSQL password: $PG_PASS"
  echo "  JWT secret: $JWT_SECRET"
else
  echo "✓ .env already exists"
fi

# ── Copy deployment files to root ──────────────────────────────────
echo "► Setting up Docker Compose..."
cp deploy/docker-compose.yml $DEPLOY_DIR/docker-compose.yml
cp deploy/Dockerfile $DEPLOY_DIR/Dockerfile
mkdir -p $DEPLOY_DIR/nginx/conf.d
cp deploy/nginx/nginx.conf $DEPLOY_DIR/nginx/nginx.conf
mkdir -p $DEPLOY_DIR/backups

# ── Build and start ────────────────────────────────────────────────
echo "► Building Docker containers (this may take a few minutes)..."
cd $DEPLOY_DIR
docker compose build

echo "► Starting services..."
docker compose up -d

echo "► Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U zionite -d zionite &>/dev/null; then
    echo "✓ PostgreSQL is ready"
    break
  fi
  sleep 2
done

# ── Database migration prompt ──────────────────────────────────────
echo ""
echo "── Database Migration ──"
echo "If you have an existing Neon database, you can migrate data now."
read -p "Do you want to migrate data from Neon? (y/n): " migrate
if [ "$migrate" = "y" ] || [ "$migrate" = "Y" ]; then
  read -p "Enter your Neon connection string (postgres://...): " neon_url
  if [ -n "$neon_url" ]; then
    echo "► Dumping database from Neon..."
    pg_dump "$neon_url" --no-owner --no-privileges --no-tablespaces -F p -f $DEPLOY_DIR/backups/neon_dump.sql
    echo "► Importing to local PostgreSQL..."
    source $DEPLOY_DIR/.env
    docker compose exec -T db psql -U ${POSTGRES_USER:-zionite} -d ${POSTGRES_DB:-zionite} < $DEPLOY_DIR/backups/neon_dump.sql
    echo "✓ Database migration complete!"
  fi
fi

# ── SSL setup ──────────────────────────────────────────────────────
echo ""
echo "── SSL Certificate ──"
echo "To enable HTTPS, point a domain's A record to this server's IP (162.35.161.120)"
read -p "Enter your domain (or press Enter to skip): " domain
if [ -n "$domain" ]; then
  echo "► Getting SSL certificate for $domain..."
  mkdir -p $DEPLOY_DIR/web-root
  docker compose restart nginx
  sleep 3

  docker run -it --rm \
    -v zionite_certbot-etc:/etc/letsencrypt \
    -v zionite_certbot-var:/var/lib/letsencrypt \
    -v zionite_web-root:/var/www/certbot \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    --email admin@zionite.online --agree-tos --no-eff-email \
    -d $domain

  # Enable HTTPS in nginx config
  sed -i "s/your-domain.com/$domain/g" $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/# location \/ {/location \//g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     return 301/    return 301/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/# server {/server {/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     listen 443/    listen 443/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     ssl_/    ssl_/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     add_header/    add_header/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#     location/    location/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         proxy/        proxy/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         # WebSocket/        # WebSocket/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         proxy_set/        proxy_set/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         # Timeouts/        # Timeouts/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         proxy_read/        proxy_read/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         proxy_send/        proxy_send/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         proxy_buffering/        proxy_buffering/g' $DEPLOY_DIR/nginx/nginx.conf
  sed -i 's/#         add_header/        add_header/g' $DEPLOY_DIR/nginx/nginx.conf

  docker compose restart nginx
  echo "✓ SSL configured for $domain"
fi

# ── Backups ────────────────────────────────────────────────────────
echo "► Setting up daily database backups..."
cat > /etc/cron.d/zionite-backup << 'EOF'
0 3 * * * root cd /opt/zionite && docker compose exec -T db pg_dump -U zionite zionite > /opt/zionite/backups/backup_$(date +\%Y\%m\%d).sql 2>/dev/null && find /opt/zionite/backups -name "backup_*.sql" -mtime +7 -delete
EOF
chmod 644 /etc/cron.d/zionite-backup
echo "✓ Daily backups configured (3 AM, 7-day retention)"

# ── Firewall ───────────────────────────────────────────────────────
echo "► Configuring firewall..."
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  echo "✓ Firewall configured (SSH, HTTP, HTTPS)"
fi

# ── Final status ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Deployment Complete!                                 ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Services:                                                   ║"
echo "║    • PostgreSQL  — port 5432 (internal)                      ║"
echo "║    • Backend API — port 3000 (via Nginx :80)                 ║"
echo "║    • Nginx       — port 80 (443 after SSL)                   ║"
echo "║                                                              ║"
echo "║  Test: curl http://localhost/ping                            ║"
echo "║                                                              ║"
echo "║  Next steps:                                                 ║"
echo "║    1. Edit .env: nano /opt/zionite/.env                      ║"
echo "║    2. Restart: docker compose restart backend                ║"
echo "║    3. Point frontend to: http://162.35.161.120               ║"
echo "║                                                              ║"
echo "║  Logs: docker compose logs -f backend                        ║"
echo "║  Status: docker compose ps                                   ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
