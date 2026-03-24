# Deployment Guide for 1GB Oracle VM

## Prerequisites

- Oracle Cloud VM with 1GB RAM
- Ubuntu/Debian-based OS
- Node.js 20.x installed
- Root or sudo access

## Step-by-Step Deployment

### 1. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version
```

### 2. Add Swap Space (Critical for 1GB RAM)

```bash
# Create 2GB swap file
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make swap permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Optimize swap usage
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf

# Verify
free -h
```

### 3. Clone and Setup Project

```bash
# Create application directory
sudo mkdir -p /opt/chat-agent
sudo chown $USER:$USER /opt/chat-agent
cd /opt/chat-agent

# Clone your repository (or upload files)
# git clone <your-repo-url> .

# Install dependencies
npm install

# Install PM2 globally
sudo npm install -g pm2
```

### 4. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit with your API keys
nano .env
```

**Required environment variables:**
```env
GOOGLE_API_KEY=your_google_api_key
ANOTHER_GOOGLE_API_KEY=your_backup_google_key
MISTRAL_API_KEY=your_mistral_key
GROQ_API_KEY=your_groq_key

NODE_OPTIONS=--max-old-space-size=768 --max-semi-space-size=2 --optimize-for-size
REQUEST_TIMEOUT=45000
LLM_TIMEOUT=30000
GROQ_TIMEOUT=15000
MAX_CONCURRENT_REQUESTS=2
ENABLE_REQUEST_QUEUE=true
MAX_CHECKPOINT_HISTORY=5
LOG_LEVEL=info
ENABLE_PERFORMANCE_LOGS=true
```

### 5. Create Logs Directory

```bash
mkdir -p logs
```

### 6. Start with PM2

```bash
# Start the application
npm run pm2:start

# Verify it's running
pm2 list

# Check logs
pm2 logs chat-agent --lines 50

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions printed by the command above
```

### 7. Configure Firewall

```bash
# Allow port 10000 (or your configured port)
sudo ufw allow 10000/tcp

# Enable firewall if not already enabled
sudo ufw enable
sudo ufw status
```

### 8. Optional: Setup Nginx Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/chat-agent
```

**Nginx configuration:**
```nginx
upstream chat_agent {
    server 127.0.0.1:10000;
    keepalive 32;
}

server {
    listen 80;
    server_name your-domain.com;  # Change this

    client_max_body_size 2M;

    location / {
        proxy_pass http://chat_agent;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    location /health {
        proxy_pass http://chat_agent/health;
        access_log off;
    }

    location /metrics {
        proxy_pass http://chat_agent/metrics;
        allow 127.0.0.1;  # Only allow localhost
        deny all;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/chat-agent /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Update firewall
sudo ufw allow 'Nginx Full'
```

### 9. Setup SSL (Optional but Recommended)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

## Monitoring and Maintenance

### Check Application Status

```bash
# PM2 status
pm2 status

# Real-time monitoring
pm2 monit

# View logs
pm2 logs chat-agent --lines 100

# Memory usage
pm2 show chat-agent
```

### Health Checks

```bash
# Local health check
curl http://localhost:10000/health

# Metrics
curl http://localhost:10000/metrics

# From external (if using Nginx)
curl http://your-domain.com/health
```

### Restart Application

```bash
# Graceful restart
npm run pm2:restart

# Or
pm2 restart chat-agent

# Hard restart if needed
pm2 delete chat-agent
npm run pm2:start
```

### View Logs

```bash
# PM2 logs
pm2 logs chat-agent

# Application logs
tail -f logs/out.log
tail -f logs/err.log

# Nginx logs (if using)
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Update Application

```bash
cd /opt/chat-agent

# Pull latest changes
git pull

# Install new dependencies
npm install

# Restart
pm2 restart chat-agent
```

## Troubleshooting

### High Memory Usage

```bash
# Check current memory
free -h

# Check PM2 memory
pm2 show chat-agent

# Restart if needed
pm2 restart chat-agent
```

### Application Not Starting

```bash
# Check PM2 logs
pm2 logs chat-agent --err --lines 50

# Check if port is in use
sudo lsof -i :10000

# Check environment variables
pm2 env 0
```

### Timeouts

```bash
# Check LLM API connectivity
curl -v https://api.mistral.ai
curl -v https://generativelanguage.googleapis.com

# Increase timeouts in .env
nano .env
# Set LLM_TIMEOUT=60000

# Restart
pm2 restart chat-agent
```

### Out of Memory Errors

```bash
# Verify swap is active
swapon --show

# Reduce concurrent requests
nano .env
# Set MAX_CONCURRENT_REQUESTS=1

# Restart
pm2 restart chat-agent
```

## Automated Monitoring Setup

### Create Health Check Script

```bash
nano /opt/chat-agent/healthcheck.sh
```

```bash
#!/bin/bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:10000/health)
if [ $RESPONSE -ne 200 ]; then
    echo "Health check failed with status $RESPONSE"
    pm2 restart chat-agent
    echo "Application restarted at $(date)" >> /opt/chat-agent/logs/restart.log
fi
```

```bash
chmod +x /opt/chat-agent/healthcheck.sh

# Add to crontab (check every 5 minutes)
crontab -e
# Add: */5 * * * * /opt/chat-agent/healthcheck.sh
```

### Daily Restart (Optional)

```bash
# Add to crontab (restart at 3 AM daily)
crontab -e
# Add: 0 3 * * * pm2 restart chat-agent
```

## Performance Tuning

### Monitor Performance

```bash
# Enable performance logs
echo "ENABLE_PERFORMANCE_LOGS=true" >> .env
pm2 restart chat-agent

# Watch metrics
watch -n 5 'curl -s http://localhost:10000/metrics | jq'
```

### Optimize for Your Workload

**Low traffic (< 10 requests/hour):**
```env
MAX_CONCURRENT_REQUESTS=1
MAX_CHECKPOINT_HISTORY=3
```

**Medium traffic (10-50 requests/hour):**
```env
MAX_CONCURRENT_REQUESTS=2
MAX_CHECKPOINT_HISTORY=5
```

**High traffic (> 50 requests/hour):**
- Consider upgrading to 2GB RAM VM
- Use Redis for checkpointing
- Add response caching

## Backup and Recovery

### Backup Configuration

```bash
# Backup .env file
cp .env .env.backup

# Backup PM2 configuration
pm2 save
cp ~/.pm2/dump.pm2 ~/.pm2/dump.pm2.backup
```

### Recovery

```bash
# Restore PM2 processes
pm2 resurrect

# Or start fresh
pm2 delete all
npm run pm2:start
```

## Security Recommendations

1. **Firewall:** Only open necessary ports
2. **API Keys:** Never commit to git, use environment variables
3. **SSL:** Always use HTTPS in production
4. **Updates:** Keep Node.js and dependencies updated
5. **Monitoring:** Set up alerts for downtime
6. **Rate Limiting:** Consider adding rate limiting for public endpoints
7. **Access Control:** Restrict /metrics endpoint to localhost

## Support

For issues or questions:
- Check `OPTIMIZATION_GUIDE.md` for detailed troubleshooting
- Review logs: `pm2 logs chat-agent`
- Check metrics: `curl http://localhost:10000/metrics`
