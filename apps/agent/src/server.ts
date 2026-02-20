 import http from "http";
 import { URL } from "url";
 import { AIMessage } from "@langchain/core/messages";
 import { graph } from "./agent";
 
 const port = Number(process.env.PORT || 10000);
 
 const server = http.createServer(async (req, res) => {
   const u = new URL(req.url || "/", `http://${req.headers.host}`);
   if (req.method === "GET" && u.pathname === "/health") {
     res.writeHead(200, { "Content-Type": "text/plain" });
     res.end("ok");
     return;
   }
   if (req.method === "POST" && u.pathname === "/invoke") {
     let body = "";
     req.on("data", (chunk) => (body += chunk));
     req.on("end", async () => {
       try {
         const parsed = body ? JSON.parse(body) : {};
         const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
         const update = await graph.invoke({ messages });
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
         res.writeHead(200, { "Content-Type": "application/json" });
         res.end(JSON.stringify({ reply, state: update }));
       } catch {
         res.writeHead(500, { "Content-Type": "application/json" });
         res.end(JSON.stringify({ error: "invoke_failed" }));
       }
     });
     return;
   }
   res.writeHead(404, { "Content-Type": "text/plain" });
   res.end("not_found");
 });
 
 server.listen(port, "0.0.0.0");
