import http from "http";
import { URL } from "url";
import { AIMessage } from "@langchain/core/messages";
import { graph } from "./agent";

const port = Number(process.env.PORT || 10000);
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 120000); // 2 minutes for low-memory systems
const MAX_CONCURRENT_REQUESTS = Number(process.env.MAX_CONCURRENT_REQUESTS || 1);  // Reduced to 1 for 1GB RAM
const ENABLE_REQUEST_QUEUE = process.env.ENABLE_REQUEST_QUEUE === "true";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const ENABLE_PERFORMANCE_LOGS = process.env.ENABLE_PERFORMANCE_LOGS === "true";

let activeRequests = 0;
const requestQueue: Array<() => void> = [];

function log(level: string, message: string, meta?: any) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  const currentLevel = levels[LOG_LEVEL as keyof typeof levels] || 2;
  const messageLevel = levels[level as keyof typeof levels] || 2;
  
  if (messageLevel <= currentLevel) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? " " + JSON.stringify(meta) : "";
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`);
  }
}

function processQueue() {
  if (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const next = requestQueue.shift();
    if (next) next();
  }
}

function withRequestLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const execute = async () => {
      activeRequests++;
      log("debug", "Request started", { activeRequests, queueLength: requestQueue.length });
      
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        activeRequests--;
        log("debug", "Request completed", { activeRequests, queueLength: requestQueue.length });
        processQueue();
      }
    };

    if (ENABLE_REQUEST_QUEUE && activeRequests >= MAX_CONCURRENT_REQUESTS) {
      log("info", "Request queued", { queueLength: requestQueue.length + 1 });
      requestQueue.push(execute);
    } else {
      execute();
    }
  });
}
 
const server = http.createServer(async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  const u = new URL(req.url || "/", `http://${req.headers.host}`);
  log("info", `${req.method} ${u.pathname}`, { requestId });
  
  if (req.method === "GET" && u.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      status: "ok", 
      activeRequests, 
      queueLength: requestQueue.length,
      memoryUsage: process.memoryUsage()
    }));
    return;
  }
  
  if (req.method === "GET" && u.pathname === "/metrics") {
    const memUsage = process.memoryUsage();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      activeRequests,
      queueLength: requestQueue.length,
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      },
      uptime: process.uptime()
    }));
    return;
  }
  
  if (req.method === "POST" && u.pathname === "/invoke") {
    let requestTimeout: NodeJS.Timeout | null = null;
    let timedOut = false;
    
    requestTimeout = setTimeout(() => {
      timedOut = true;
      log("error", "Request timeout", { requestId, duration: Date.now() - startTime });
      if (!res.headersSent) {
        res.writeHead(408, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          error: "request_timeout",
          message: `Request exceeded ${REQUEST_TIMEOUT}ms timeout`
        }));
      }
    }, REQUEST_TIMEOUT);
    
    let body = "";
    let bodySize = 0;
    const MAX_BODY_SIZE = 1024 * 1024;
    
    req.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        req.destroy();
        if (requestTimeout) clearTimeout(requestTimeout);
        if (!res.headersSent) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "payload_too_large" }));
        }
        return;
      }
      body += chunk;
    });
    
    req.on("end", async () => {
      if (timedOut) return;
      
      try {
        await withRequestLimit(async () => {
          if (timedOut) return;
          
          const parsed = body ? JSON.parse(body) : {};
          const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
          
          log("debug", "Invoking graph", { requestId, messageCount: messages.length });
          const invokeStart = Date.now();
          
          const update = await graph.invoke({ messages });
          
          const invokeDuration = Date.now() - invokeStart;
          if (ENABLE_PERFORMANCE_LOGS) {
            log("info", "Graph invocation completed", { requestId, duration: invokeDuration });
          }
          
          if (timedOut) return;
          
          const list: any[] = Array.isArray(update?.messages) ? (update.messages as any[]) : [];
          let reply = "";
          const found = list.find((m) => m instanceof AIMessage);
          if (found && typeof (found as any).content === "string") {
            reply = (found as any).content;
          } else if (list.length > 0) {
            const last = list[list.length - 1];
            if (typeof last?.content === "string") reply = last.content;
            else if (typeof (last as any)?.text === "string") reply = (last as any).text;
          }
          
          if (requestTimeout) clearTimeout(requestTimeout);
          
          if (!res.headersSent) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ reply, state: update }));
          }
          
          const totalDuration = Date.now() - startTime;
          log("info", "Request completed successfully", { requestId, duration: totalDuration });
        });
      } catch (error) {
        if (requestTimeout) clearTimeout(requestTimeout);
        
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        log("error", "Request failed", { requestId, error: errorMsg });
        
        if (!res.headersSent && !timedOut) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ 
            error: "invoke_failed",
            message: errorMsg
          }));
        }
      }
    });
    
    req.on("error", (error) => {
      if (requestTimeout) clearTimeout(requestTimeout);
      log("error", "Request error", { requestId, error: error.message });
    });
    
    return;
  }
  
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not_found");
});
 
server.listen(port, "0.0.0.0", () => {
  log("info", `Server started on port ${port}`, {
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    requestTimeout: REQUEST_TIMEOUT,
    queueEnabled: ENABLE_REQUEST_QUEUE,
    nodeVersion: process.version
  });
});

server.on("error", (error) => {
  log("error", "Server error", { error: error.message });
});

process.on("SIGTERM", () => {
  log("info", "SIGTERM received, shutting down gracefully");
  server.close(() => {
    log("info", "Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  log("info", "SIGINT received, shutting down gracefully");
  server.close(() => {
    log("info", "Server closed");
    process.exit(0);
  });
});

process.on("uncaughtException", (error) => {
  log("error", "Uncaught exception", { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection", { reason });
});

if (ENABLE_PERFORMANCE_LOGS) {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    log("debug", "Memory usage", {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
    });
  }, 60000);
}
