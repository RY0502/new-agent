module.exports = {
  apps: [
    {
      name: 'langgraph-agent',
      script: 'bash',
      args: '-lc "pnpm exec langgraphjs dev --host 0.0.0.0 --port 8123 --no-browser"',
      cwd: '/home/opc/new-agent-main/apps/agent',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '900M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '60s',
      restart_delay: 8000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        // CRITICAL: extend schema-extract worker timeout from default 30s -> 5min
        // The TypeScript-Compiler-API worker spawned by langgraph-api is heavy
        // and easily times out on 1GB RAM with swap.
        LANGGRAPH_SCHEMA_RESOLVE_TIMEOUT_MS: '300000',
        // Heap cap for the dev server (parent process). Note: --gc-interval is
        // NOT allowed in NODE_OPTIONS env var (CLI-only), so we omit it here.
        NODE_OPTIONS: '--max-old-space-size=640',
        // Agent runtime tuning
        REQUEST_TIMEOUT: '180000',
        LLM_TIMEOUT: '120000',
        GROQ_TIMEOUT: '60000',
        MAX_CONCURRENT_REQUESTS: '1',
        ENABLE_REQUEST_QUEUE: 'true',
        LOG_LEVEL: 'warn',
        MAX_CHECKPOINT_HISTORY: '3'
      }
    },
    {
      // One-shot job: waits for the dev server, then forces schema extraction
      // immediately while memory is still fresh. Once cached, all subsequent
      // /assistants/{id}/schemas calls are instant.
      name: 'langgraph-prewarm',
      script: 'node',
      args: 'scripts/prewarm-schema.mjs 127.0.0.1 8123 starterAgent',
      cwd: '/home/opc/new-agent-main/apps/agent',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      watch: false,
      env: {
        LANGGRAPH_SCHEMA_RESOLVE_TIMEOUT_MS: '300000'
      }
    }
  ]
};
