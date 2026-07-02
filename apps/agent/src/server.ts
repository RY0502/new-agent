import http from "http";
import { URL } from "url";
import { invokeGraph, getHealth, getMetrics } from "./agent-server.js";

const port = Number(process.env.PORT || 10000);

const server = http.createServer(async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  const u = new URL(req.url || "/", `http://${req.headers.host}`);
  
  if (req.method === "GET" && u.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getHealth()));
    return;
  }

  if (req.method === "GET" && u.pathname === "/metrics") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getMetrics()));
    return;
  }

  if (req.method === "POST" && u.pathname === "/invoke") {
    let body = "";
    let bodySize = 0;
    const MAX_BODY_SIZE = 1024 * 1024;

    req.on("data", (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        req.destroy();
        if (!res.headersSent) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "payload_too_large" }));
        }
      }
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = await invokeGraph(parsed);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));

        const totalDuration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] [info] ${req.method} ${u.pathname} completed`, { requestId, duration: totalDuration });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[${new Date().toISOString()}] [error] ${req.method} ${u.pathname} failed`, { requestId, error: errorMsg });
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invoke_failed", message: errorMsg }));
        }
      }
    });

    req.on("error", (error) => {
      console.error(`[${new Date().toISOString()}] [error] Request error`, { requestId, error: error.message });
    });

    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not_found");
});
 
server.listen(port, "0.0.0.0", () => {
  console.log(`[${new Date().toISOString()}] [info] Server started on port ${port}`);
});

server.on("error", (error) => {
  console.error(`[${new Date().toISOString()}] [error] Server error`, { error: error.message });
});
