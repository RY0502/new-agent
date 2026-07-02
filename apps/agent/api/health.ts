import { getHealth } from "../src/agent-server.js";

export default async function handler(_req: Request): Promise<Response> {
  return new Response(JSON.stringify(getHealth()), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
