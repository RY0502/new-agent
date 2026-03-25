module.exports = {
  apps: [{
    name: 'langgraph-agent',
    script: 'bash',
    args: '-lc "pnpm exec langgraphjs dev --host 0.0.0.0 --port 8123 --no-browser"',
    cwd: '/home/opc/new-agent-main/apps/agent',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '700M',
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    kill_timeout: 5000
  }]
};
