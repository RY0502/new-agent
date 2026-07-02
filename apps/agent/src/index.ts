export { invokeGraph, getHealth, getMetrics } from "./agent-server.js";

// Vercel detects this file as a serverless entry point (due to ESM + project structure).
// All real traffic is routed to api/ handlers via vercel.json routes.
// This default export satisfies Vercel's validator requirement.
export default async function handler(_req: any, res: any) {
  res.status(404).json({ error: "not_found" });
}
