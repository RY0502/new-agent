export { invokeGraph, getHealth, getMetrics } from "./agent-server.js";

// Vercel auto-detects this file as a serverless entry point.
// All real traffic is routed to api/ handlers via vercel.json routes.
// Using Web Fetch API style (Request → Response) since Vercel's /opt/rust/nodejs.js
// runtime does not provide Express-style res.status() / res.json() helpers.
export default async function handler(_req: Request): Promise<Response> {
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}
