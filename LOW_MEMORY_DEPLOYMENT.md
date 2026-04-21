# Low Memory Deployment Guide (1GB RAM)

This guide helps you deploy the agent on systems with limited RAM (1GB physical + 4GB virtual memory), such as OCI free tier instances.

## ⚠️ Timeout Issues

On low-memory systems, you may experience timeout errors due to:
- Memory swapping to disk (very slow)
- LLM API calls taking longer
- Node.js garbage collection pauses

## ✅ Optimizations Applied

### 1. **Increased Timeouts**

Updated default timeouts to handle memory pressure:
- **Request Timeout**: 45s → **120s** (2 minutes)
- **LLM Timeout**: 30s → **90s** (1.5 minutes)
- **Groq Timeout**: 15s → **45s**

### 2. **Reduced Concurrency**

- **Max Concurrent Requests**: 2 → **1**
- Only one request processed at a time to avoid memory exhaustion

### 3. **Memory Limits**

Added new script for 1GB systems:
```bash
pnpm run dev:1gb
```

This uses:
- `--max-old-space-size=384` (384MB heap limit)
- `--gc-interval=100` (more frequent garbage collection)

### 4. **Environment Configuration**

Copy the 1GB-optimized environment file:
```bash
cd apps/agent
cp .env.1gb .env
```

Then add your API keys to `.env`.

## 🚀 Deployment Steps

### For Development:
```bash
cd apps/agent
cp .env.1gb .env
# Add your API keys to .env
pnpm run dev:1gb
```

### For Production:
```bash
cd apps/agent
cp .env.1gb .env
# Add your API keys to .env
pnpm run start:prod
```

## 📊 Monitoring

Watch for these signs of memory issues:
- Slow response times (>60 seconds)
- Timeout errors in logs
- High swap usage: `free -h` or `htop`

## 🔧 Additional Optimizations

### 1. **Enable Swap** (if not already enabled)
```bash
# Check current swap
free -h

# Create 4GB swap file (if needed)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. **Reduce Swap Usage**
```bash
# Reduce swappiness (prefer RAM over swap)
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

### 3. **Monitor Memory**
```bash
# Watch memory usage
watch -n 1 free -h

# Check process memory
ps aux --sort=-%mem | head -10
```

### 4. **Restart on OOM**

Add to systemd service (if using systemd):
```ini
[Service]
Restart=on-failure
RestartSec=10
```

## 🎯 Expected Performance

On 1GB RAM systems:
- **First request**: 30-60 seconds (cold start)
- **Subsequent requests**: 15-45 seconds
- **With memory pressure**: 60-90 seconds

## ⚙️ Environment Variables

Key variables for low-memory systems:

| Variable | Default | 1GB Recommended |
|----------|---------|-----------------|
| `REQUEST_TIMEOUT` | 45000 | 120000 |
| `LLM_TIMEOUT` | 30000 | 90000 |
| `GROQ_TIMEOUT` | 15000 | 45000 |
| `MAX_CONCURRENT_REQUESTS` | 2 | 1 |
| `ENABLE_REQUEST_QUEUE` | false | true |
| `LOG_LEVEL` | info | warn |

## 🐛 Troubleshooting

### Still Getting Timeouts?

1. **Increase timeouts further**:
   ```bash
   export REQUEST_TIMEOUT=180000  # 3 minutes
   export LLM_TIMEOUT=150000      # 2.5 minutes
   ```

2. **Check swap usage**:
   ```bash
   free -h
   # If swap is full, system is thrashing
   ```

3. **Reduce memory usage**:
   ```bash
   # Use even lower heap size
   NODE_OPTIONS='--max-old-space-size=256'
   ```

4. **Check for memory leaks**:
   ```bash
   # Monitor Node.js memory
   node --expose-gc --trace-gc src/server.ts
   ```

### Out of Memory Errors?

1. **Increase swap space** to 6GB or 8GB
2. **Use smaller models** (if possible)
3. **Reduce `MAX_CONCURRENT_REQUESTS` to 1**
4. **Enable request queuing**: `ENABLE_REQUEST_QUEUE=true`

## 📝 Notes

- These settings prioritize **reliability over speed**
- Expect slower response times on 1GB systems
- Consider upgrading to 2GB+ RAM for better performance
- Monitor system resources regularly

## 🔗 Related Files

- `apps/agent/.env.1gb` - Environment template
- `apps/agent/src/agent.ts` - Timeout configuration
- `apps/agent/src/server.ts` - Server configuration
- `apps/agent/package.json` - Run scripts
