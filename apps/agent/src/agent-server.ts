import { AIMessage } from "@langchain/core/messages";
import { graph } from "./agent.js";

const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 120000);
const MAX_CONCURRENT_REQUESTS = Number(process.env.MAX_CONCURRENT_REQUESTS || 1);
const ENABLE_REQUEST_QUEUE = process.env.ENABLE_REQUEST_QUEUE === "true";

let activeRequests = 0;
const requestQueue: Array<() => void> = [];

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
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        activeRequests--;
        processQueue();
      }
    };

    if (ENABLE_REQUEST_QUEUE && activeRequests >= MAX_CONCURRENT_REQUESTS) {
      requestQueue.push(execute);
    } else {
      execute();
    }
  });
}

export function getHealth() {
  return {
    status: "ok",
    activeRequests,
    queueLength: requestQueue.length,
    uptime: process.uptime(),
  };
}

export function getMetrics() {
  const memUsage = process.memoryUsage();
  return {
    activeRequests,
    queueLength: requestQueue.length,
    memory: {
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    },
    uptime: process.uptime(),
  };
}

export async function invokeGraph(body: any) {
  return withRequestLimit(async () => {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const update = await graph.invoke({ messages });

    const list: any[] = Array.isArray(update?.messages) ? update.messages : [];
    let reply = "";

    const found = list.find((m) => m instanceof AIMessage);
    if (found && typeof found.content === "string") {
      reply = found.content;
    } else if (list.length > 0) {
      const last = list[list.length - 1];
      if (typeof last?.content === "string") reply = last.content;
      else if (typeof last?.text === "string") reply = last.text;
    }

    return { reply, state: update };
  });
}
