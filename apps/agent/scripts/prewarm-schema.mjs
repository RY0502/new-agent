#!/usr/bin/env node
/**
 * Pre-warms the LangGraph dev-server schema cache.
 *
 * On 1GB RAM Oracle VMs the schema-extract worker times out the first time a
 * client hits /assistants/{id}/schemas because the parent process is already
 * heavy. Calling this endpoint immediately after startup (while only the dev
 * server is loaded) gives the worker the best chance of finishing inside the
 * configured LANGGRAPH_SCHEMA_RESOLVE_TIMEOUT_MS window.
 *
 * Usage:  node scripts/prewarm-schema.mjs [host] [port] [graphId]
 * Defaults: 127.0.0.1, 8123, starterAgent
 */
const HOST = process.argv[2] || process.env.LANGGRAPH_HOST || "127.0.0.1";
const PORT = process.argv[3] || process.env.LANGGRAPH_PORT || "8123";
const GRAPH_ID = process.argv[4] || process.env.LANGGRAPH_GRAPH_ID || "starterAgent";
const MAX_ATTEMPTS = Number(process.env.PREWARM_MAX_ATTEMPTS || 60);
const BOOT_INTERVAL_MS = Number(process.env.PREWARM_BOOT_INTERVAL_MS || 5000);
const SCHEMA_TIMEOUT_MS = Number(process.env.LANGGRAPH_SCHEMA_RESOLVE_TIMEOUT_MS || 300000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, opts = {}, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function waitForServer() {
  const url = `http://${HOST}:${PORT}/ok`;
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      const res = await fetchWithTimeout(url, {}, 3000);
      if (res.ok) {
        console.log(`[prewarm] Dev server is up after ${i} attempt(s)`);
        return true;
      }
    } catch {
      // server not ready yet
    }
    await sleep(BOOT_INTERVAL_MS);
  }
  return false;
}

async function findAssistantId() {
  // Prefer the deterministic UUID v5 from langgraph-api (NAMESPACE_GRAPH).
  // Easier: just query /assistants/search and find the one whose graph_id matches.
  const url = `http://${HOST}:${PORT}/assistants/search`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 50, offset: 0 }),
    },
    10000
  );
  if (!res.ok) throw new Error(`assistants/search failed: ${res.status}`);
  const data = await res.json();
  const match = (Array.isArray(data) ? data : []).find((a) => a.graph_id === GRAPH_ID);
  if (!match) throw new Error(`No assistant found for graph_id=${GRAPH_ID}`);
  return match.assistant_id;
}

async function prewarmSchema(assistantId) {
  const url = `http://${HOST}:${PORT}/assistants/${assistantId}/schemas`;
  console.log(`[prewarm] Triggering schema extraction (timeout ${SCHEMA_TIMEOUT_MS}ms)…`);
  const start = Date.now();
  const res = await fetchWithTimeout(url, {}, SCHEMA_TIMEOUT_MS + 30000);
  const dur = Date.now() - start;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`schemas endpoint ${res.status}: ${body.slice(0, 500)}`);
  }
  console.log(`[prewarm] Schema cached in ${(dur / 1000).toFixed(1)}s`);
}

(async () => {
  console.log(`[prewarm] Waiting for http://${HOST}:${PORT} …`);
  if (!(await waitForServer())) {
    console.error("[prewarm] Dev server never became ready, giving up.");
    process.exit(1);
  }

  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const assistantId = await findAssistantId();
      console.log(`[prewarm] Assistant id for "${GRAPH_ID}": ${assistantId}`);
      await prewarmSchema(assistantId);
      console.log("[prewarm] Done.");
      process.exit(0);
    } catch (err) {
      lastErr = err;
      console.warn(`[prewarm] Attempt ${i} failed: ${err.message}`);
      await sleep(10000);
    }
  }
  console.error(`[prewarm] All attempts failed: ${lastErr?.message}`);
  // Exit 0 anyway — pre-warm is best-effort, don't fail the deploy
  process.exit(0);
})();
