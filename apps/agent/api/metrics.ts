import { getMetrics } from "../src/agent-server.js";

export default function handler(_req: any, res: any) {
  res.status(200).json(getMetrics());
}
