# Deployment Guide - Ubuntu VPS with systemd

This guide covers deploying Iris to a Ubuntu VPS with systemd for process management.

## Prerequisites

- Ubuntu 22.04 LTS or later
- Root or sudo access
- Domain name pointing to your server (for HTTPS)
- Resend account for email sending

## 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version  # Verify installation
```

## 2. Create Iris User (Optional but Recommended)

```bash
sudo useradd -r -m -s /bin/bash iris
sudo su - iris
```

## 3. Clone and Install

```bash
cd /opt
sudo git clone <repository-url> iris
sudo chown -R $USER:$USER iris
cd iris
bun install
```

## 4. Configure Environment

Create the configuration directory and file:

```bash
sudo mkdir -p /etc/iris
sudo nano /etc/iris/.env
```

Add the following configuration:

```bash
# Environment
NODE_ENV=production

# Server
IRIS_PORT=4096
IRIS_HOST=0.0.0.0
IRIS_DATA_DIR=/var/lib/iris
IRIS_LOG_LEVEL=info

# Auth & Email
APP_URL=https://your-domain.com
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=noreply@your-domain.com

# Security - Generate with: openssl rand -base64 32
IRIS_ENCRYPTION_KEY=your-secure-encryption-key-here
```

**Important:** Generate a secure encryption key:

```bash
openssl rand -base64 32
```

Secure the config file:

```bash
sudo chmod 600 /etc/iris/.env
sudo chown iris:iris /etc/iris/.env  # If using iris user
```

## 5. Create Data Directory

```bash
sudo mkdir -p /var/lib/iris
sudo chown iris:iris /var/lib/iris  # Or your user
```

## 6. Create systemd Service

Copy the service file:

```bash
sudo cp /opt/iris/docs/iris.service /etc/systemd/system/iris.service
```

Or create manually:

```bash
sudo nano /etc/systemd/system/iris.service
```

Contents (adjust user/paths as needed):

```ini
[Unit]
Description=Iris AI Agent Server
Documentation=https://github.com/your-org/iris
After=network.target

[Service]
Type=simple
User=iris
Group=iris
WorkingDirectory=/opt/iris
EnvironmentFile=/etc/iris/.env
ExecStart=/home/iris/.bun/bin/bun run src/index.ts
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=10
TimeoutStopSec=30

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
ReadWritePaths=/var/lib/iris

# Resource limits
LimitNOFILE=65535
MemoryMax=2G

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iris

[Install]
WantedBy=multi-user.target
```

## 7. Enable and Start Service

```bash
sudo systemctl daemon-reload
sudo systemctl enable iris
sudo systemctl start iris
```

Check status:

```bash
sudo systemctl status iris
```

## 8. Configure Nginx (Reverse Proxy)

Install Nginx:

```bash
sudo apt update
sudo apt install nginx
```

Create site configuration:

```bash
sudo nano /etc/nginx/sites-available/iris
```

Contents:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL configuration (will be added by Certbot)
    # ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4096;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/iris /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t  # Test configuration
sudo systemctl reload nginx
```

## 9. Setup SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot will automatically configure SSL and set up renewal.

## 10. Verify Installation

Test the health endpoint:

```bash
curl https://your-domain.com/health
```

Expected response:

```json
{"status":"ok"}
```

## Upgrade Workflow

To update Iris to a new version:

```bash
cd /opt/iris
sudo systemctl stop iris
git pull
bun install
# Migrations run automatically on startup
sudo systemctl start iris
```

For zero-downtime upgrades (if using multiple instances behind a load balancer):

```bash
# On each instance:
cd /opt/iris
git pull
bun install
sudo systemctl restart iris
# Wait for health check to pass before proceeding to next instance
```

## Backup

### Database Backup

```bash
# Single file backup
cp /var/lib/iris/iris.db /backup/iris-$(date +%Y%m%d).db

# Full directory backup (includes project databases)
tar -czf /backup/iris-full-$(date +%Y%m%d).tar.gz /var/lib/iris
```

### Automated Backup (cron)

```bash
sudo crontab -e
```

Add:

```
# Daily backup at 2 AM
0 2 * * * tar -czf /backup/iris-$(date +\%Y\%m\%d).tar.gz /var/lib/iris
# Keep only last 7 days
0 3 * * * find /backup -name "iris-*.tar.gz" -mtime +7 -delete
```

## Logs

View logs:

```bash
# Recent logs
sudo journalctl -u iris -n 100

# Follow logs in real-time
sudo journalctl -u iris -f

# Logs since last boot
sudo journalctl -u iris -b

# Logs from specific time
sudo journalctl -u iris --since "2024-01-01 00:00:00"
```

## Troubleshooting

### Service won't start

Check logs for errors:

```bash
sudo journalctl -u iris -e
```

Common issues:
- Missing environment variables
- Wrong file permissions
- Port already in use

### Permission errors

```bash
sudo chown -R iris:iris /var/lib/iris
sudo chown -R iris:iris /opt/iris
```

### Database locked

```bash
sudo systemctl stop iris
# Wait for any locks to release
sleep 5
sudo systemctl start iris
```

### Email not sending

1. Check Resend API key is correct
2. Verify `EMAIL_FROM` domain is verified in Resend
3. Check logs for email-related errors

### SSL certificate issues

```bash
# Test certificate
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

## Security Checklist

- [ ] `IRIS_ENCRYPTION_KEY` is set and secure
- [ ] `/etc/iris/.env` has restricted permissions (600)
- [ ] Firewall allows only ports 80, 443, 22
- [ ] SSH key authentication only (disable password auth)
- [ ] Regular security updates applied
- [ ] Backup encryption enabled for off-site backups
- [ ] Rate limiting configured in Nginx

## Firewall Configuration (ufw)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## Resource Monitoring

Install monitoring tools:

```bash
sudo apt install htop iotop
```

Monitor resource usage:

```bash
# CPU and memory
htop

# Disk I/O
sudo iotop

# Disk space
df -h /var/lib/iris
```
