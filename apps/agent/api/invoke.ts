import { invokeGraph } from "../src/agent-server.js";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = req.body ? await req.json() : {};
    const result = await invokeGraph(body);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: "invoke_failed", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
