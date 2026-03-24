module.exports = {
  apps: [{
    name: 'chat-agent',
    script: 'src/server.ts',
    interpreter: 'tsx',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '700M',
    node_args: '--max-old-space-size=768 --max-semi-space-size=2 --optimize-for-size',
    env: {
      NODE_ENV: 'production',
      PORT: 10000,
      REQUEST_TIMEOUT: 45000,
      LLM_TIMEOUT: 30000,
      GROQ_TIMEOUT: 15000,
      MAX_CONCURRENT_REQUESTS: 2,
      ENABLE_REQUEST_QUEUE: 'true',
      MAX_CHECKPOINT_HISTORY: 5,
      LOG_LEVEL: 'info',
      ENABLE_PERFORMANCE_LOGS: 'true'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    kill_timeout: 5000
  }]
};
