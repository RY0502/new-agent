/**
 * This is the main entry point for the agent.
 * It defines the workflow graph, state, tools, nodes and edges.
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { MemorySaver, StateGraph } from "@langchain/langgraph";
import { CopilotKitStateAnnotation } from "@copilotkit/sdk-js/langchain";
import { copilotKitEmitMessage, copilotKitEmitState } from "@copilotkit/sdk-js/langchain";
import { Annotation } from "@langchain/langgraph";

function extractText(c: any): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const tp = c.find((p) => p?.type === "text");
    if (tp?.text) return String(tp.text);
    return c.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join(" ").trim();
  }
  if (typeof c?.text === "string") return c.text;
  return "";
}

function getLastUserText(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const role = (m as any)?.role ?? (m as any)?.type;
    const isHuman =
      m instanceof HumanMessage ||
      role === "human" ||
      role === "user";
    if (isHuman) {
      return extractText((m as any)?.content);
    }
  }
  return "";
}

// ─── A2UI Component Definitions ──────────────────────────────────────────────
// Each component definition includes a schema and an example.
// Tags are named unique (e.g., <a2-table>) to avoid collision.

const COMPONENT_DEFINITIONS: Record<string, { tag: string; schema: string; example: string }> = {
  result: {
    tag: "a2-result",
    schema: [
      "<a2-result> — wraps plain-text or markdown content.",
      "No special attributes. Content goes directly between the opening and closing tags.",
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      "<a2-result>",
      "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France.",
      "It was constructed from 1887 to 1889 as the centrepiece of the 1889 World's Fair.",
      "</a2-result>",
    ].join("\n"),
  },
  list: {
    tag: "a2-list",
    schema: [
      "<a2-list> — renders a bulleted / numbered list.",
      'Inner content MUST be a valid JSON array of strings.',
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      '<a2-list>["Lionel Messi has 3 sons", "Thiago Messi (born 2012)", "Mateo Messi (born 2015)", "Ciro Messi (born 2018)"]</a2-list>',
    ].join("\n"),
  },
  table: {
    tag: "a2-table",
    schema: [
      "<a2-table> — renders a data table.",
      'Inner content MUST be a valid JSON object: { "columns": string[], "rows": any[][] }.',
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      `<a2-table>{"columns":["City","Temp","Weather"],"rows":[["NYC","22°C","Sunny"],["LON","15°C","Rainy"]]}</a2-table>`,
    ].join("\n"),
  },
  tabs: {
    tag: "a2-tabs",
    schema: [
      "<a2-tabs> — renders a tabbed view.",
      'Inner content MUST be a valid JSON object: { "tabItems": [{ "title": string, "content": string }] }.',
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      '<a2-tabs>{"tabItems":[{"title":"React","content":"React is a JavaScript library for building user interfaces, maintained by Meta."},{"title":"Angular","content":"Angular is a TypeScript-based framework maintained by Google."}]}</a2-tabs>',
    ].join("\n"),
  },
  code: {
    tag: "a2-code",
    schema: [
      '<a2-code language="LANG"> — renders a syntax-highlighted code block.',
      "Inner content: raw source code ONLY. Do NOT wrap in markdown fences.",
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      '<a2-code language="python">def fibonacci(n):',
      "    a, b = 0, 1",
      "    for _ in range(n):",
      "        yield a",
      "        a, b = b, a + b</a2-code>",
    ].join("\n"),
  },
  video: {
    tag: "a2-video",
    schema: [
      "<a2-video> — renders an embedded video player.",
      'Inner content MUST be a valid JSON object matching the requested schema: { "id": string, "component": { "Video": { "url": { "literalString": string } } } }.',
      "If the user asks for a YouTube video, you MUST perform a search to find a specific video ID (11 characters).",
      "The URL MUST follow the EXACT format: https://www.youtube.com/embed/VIDEO_ID",
      "CRITICAL: Do not use generic links like youtube.com or search result redirects. You must identify the unique 'v' parameter or embed ID for the specific content.",
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      '<a2-video>{"id": "video-1", "component": { "Video": { "url": { "literalString": "https://www.youtube.com/embed/dQw4w9WgXcQ" } } }}</a2-video>',
    ].join("\n"),
  },
};

/**
 * Builds a complete A2UI system-prompt section for the selected component.
 */
function buildA2UISystemPrompt(component: string, extraSchema: string): string {
  const def = COMPONENT_DEFINITIONS[component] || COMPONENT_DEFINITIONS["result"];
  const tagName = def.tag;
  return [
    "Your response MUST use A2UI component markup. Output ONLY valid A2UI tags — no extra prose outside the tags, no markdown fences.",
    "",
    "--- SELECTED A2UI COMPONENT ---",
    "Component Tag: <" + tagName + ">",
    def.schema,
    "",
    "--- EXAMPLE OUTPUT ---",
    def.example,
    "--- END EXAMPLE ---",
    "",
    "Rules:",
    "1. Start with <section>Answer</section>.",
    "2. Then output EXACTLY ONE <" + tagName + "> tag with the structured content.",
    "3. For JSON-based components (list, table, tabs), do NOT include any text OR newlines between the start tag and the JSON object/array.",
    "4. Do NOT output any text outside of the A2UI tags.",
    "5. Do NOT use markdown code fences anywhere in your response.",
    extraSchema ? "\n" + extraSchema : "",
  ].join("\n");
}

// 1. Define our agent state
const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec,
  proverbs: Annotation<string[]>,
  needsSearch: Annotation<boolean>({
    value: (left, right) => (typeof right === "boolean" ? right : left),
    default: () => false,
  }),
  appEvent: Annotation<string>(),
  selectedUI: Annotation<string>({
    value: (left, right) => (typeof right === "string" ? right : left),
    default: () => "",
  }),
  selectedUISchema: Annotation<string>({
    value: (left, right) => (typeof right === "string" ? right : left),
    default: () => "",
  }),
  logs: Annotation<string[]>({
    value: (left, right) => right,
    default: () => [],
  }),
});

// 2. Define the type for our agent state
export type AgentState = typeof AgentStateAnnotation.State;

const mistralChat = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> => {
  const { ChatMistralAI } = await import("@langchain/mistralai");
  const mistral = new ChatMistralAI({ model: "mistral-large-latest" });
  const lastUser = getLastUserText(state.messages as any);
  const sel = (state.selectedUI || "result").toLowerCase();
  const a2uiPrompt = buildA2UISystemPrompt(sel, state.selectedUISchema || "");
  const reply = await mistral.invoke([
    ["system", "You are a helpful assistant that can answer the given user query with the best of your knowledge."],
    ["system", a2uiPrompt],
    ["user", lastUser],
  ] as any);
  let text = "";
  if (typeof reply.content === "string") {
    text = reply.content;
  } else if (Array.isArray(reply.content)) {
    const tp = (reply.content as any[]).find((p) => p?.type === "text");
    text = tp?.text ?? "";
  }

  // Prepend persistent logs wrapped in a single status accordion
  const finalLogs = state.logs || [];
  if (finalLogs.length > 0) {
    text = `<status>\n${finalLogs.join("\n")}\n</status>\n\n${text}`;
  }

  return { messages: [new AIMessage(text)] };
};

let keyToggle = true;

const geminiSearch = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> => {
  const { ChatGoogle } = await import("@langchain/google");

  const key1 = process.env.GOOGLE_API_KEY;
  const key2 = process.env.ANOTHER_GOOGLE_API_KEY;
  const apiKey = keyToggle ? key1 : (key2 || key1);
  keyToggle = !keyToggle;

  const llm = new ChatGoogle({
    model: "gemini-2.5-flash",
    apiKey: apiKey,
  });
  const lastUser = getLastUserText(state.messages as any);
  const sel = (state.selectedUI || "result").toLowerCase();
  const a2uiPrompt = buildA2UISystemPrompt(sel, state.selectedUISchema || "");
  const reply = await llm.invoke([
    ["system", "You are an agent with web search capabilities. Fetch real-time data to answer the user query."],
    ["system", "If the user wants a video, explicitly look for specific YouTube video IDs in the search results. DO NOT provide generic YouTube home or search URLs. You must extract a real video ID (e.g. dQw4w9WgXcQ) and use the /embed/ format."],
    ["system", a2uiPrompt],
    ["user", lastUser],
  ] as any);
  let text = String(reply.content || reply.text || "");

  // Prepend persistent logs wrapped in a single status accordion
  const finalLogs = state.logs || [];
  if (finalLogs.length > 0) {
    text = `<status>\n${finalLogs.join("\n")}\n</status>\n\n${text}`;
  }

  return { messages: [new AIMessage(text)] };
};

const appData = async (
  _config: RunnableConfig
): Promise<typeof AgentStateAnnotation.Update> => {
  const appEvent = "Classifying search intent";
  await copilotKitEmitMessage(_config, `<status>${appEvent}</status>`);
  return {
    appEvent,
    logs: [appEvent],
  };
}

const groqClassify = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig
): Promise<typeof AgentStateAnnotation.Update> => {
  const { ChatGroq } = await import("@langchain/groq");
  const groq = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0,
    maxRetries: 2
  });
  const res = await groq.invoke([
    ["system", 'Classify if the query requires real-time web data (SEARCH) or can be answered by training data (NO_SEARCH). Output ONLY JSON: {"needs_search": boolean, "reason": "string"}'],
    ["user", getLastUserText(state.messages as any)],
  ] as any);
  let needsSearch = false;
  let reason: string | undefined = undefined;
  try {
    let contentText = "";
    if (typeof res.content === "string") {
      contentText = res.content;
    } else if (Array.isArray(res.content)) {
      const textPart = (res.content as any[]).find((p) => p?.type === "text");
      contentText = textPart?.text ?? "";
    }
    const parsed = JSON.parse(contentText);
    needsSearch = !!parsed.needs_search;
    reason = typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    needsSearch = false;
  }
  const rawMsg = needsSearch ? "Routing: SEARCH" : "Routing: NO_SEARCH";
  await copilotKitEmitMessage(_config, `<status>${rawMsg}</status>`);
  return {
    needsSearch,
    logs: [...(state.logs || []), rawMsg],
  };
};

const groqUIDecider = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig
): Promise<typeof AgentStateAnnotation.Update> => {
  const { ChatGroq } = await import("@langchain/groq");
  const groq = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0,
    maxRetries: 2
  });
  const userText = getLastUserText(state.messages as any);
  const startMsg = "Determining the display format";
  await copilotKitEmitMessage(_config, `<status>${startMsg}</status>`);

  const prompt = [
    "You are a UI display selector. Choose the single best A2UI component for rendering the answer to the user query.",
    'Allowed components: "tabs", "table", "list", "result", "code", "video".',
    "Selection rules:",
    '- User explicitly asks for a "table" or "tabular format" -> "table"',
    '- Comparison queries -> "tabs" (e.g., "react vs angular", "compare SAML and OAuth")',
    '- Multi-attribute/statistics -> "table" (e.g., "Weather in Delhi today")',
    '- Summarized, scannable bullet-like facts -> "list" (e.g., "Lionel Messi kids")',
    '- General details or when unsure -> "result"',
    '- Code output -> "code" (e.g., "write a Python function to ...")',
    '- Video, clips or youtube requests -> "video"',
    'Output ONLY JSON: {"component": "<one_of_allowed>", "reason": "<short why>"}.',
    "Query: " + userText,
  ].join("\n");
  const res = await groq.invoke([
    ["system", "Select the best single component according to the rules."],
    ["user", prompt],
  ] as any);
  let component = "result";
  try {
    let contentText = "";
    if (typeof res.content === "string") {
      contentText = res.content;
    } else if (Array.isArray(res.content)) {
      const textPart = (res.content as any[]).find((p) => p?.type === "text");
      contentText = textPart?.text ?? "";
    }
    const parsed = JSON.parse(contentText);
    let cand = String(parsed.component || "result").toLowerCase();
    if (cand === "tab") cand = "tabs";
    if (cand === "vid") cand = "video";
    if (["tabs", "table", "list", "result", "code", "video"].includes(cand)) component = cand;
  } catch (e) { }

  const def = COMPONENT_DEFINITIONS[component] || COMPONENT_DEFINITIONS["result"];
  const selectedUISchema = [
    "--- SELECTED A2UI COMPONENT ---",
    "Component: <" + def.tag + ">",
    def.schema,
    "",
    "--- EXAMPLE OUTPUT ---",
    def.example,
    "--- END ---",
  ].join("\n");

  const selectedMsg = "Selected **" + component + "** for rendering";
  await copilotKitEmitMessage(_config, `<status>${selectedMsg}</status>`);

  return {
    selectedUI: component,
    selectedUISchema,
    logs: [...(state.logs || []), startMsg, selectedMsg],
  };
};

export const route = (
  state: any,
): "__end__" | "geminiSearch" | "mistralChat" => {
  return state.needsSearch ? "geminiSearch" : "mistralChat";
};

const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("appData", appData)
  .addNode("groqClassify", groqClassify)
  .addNode("groqUIDecider", groqUIDecider)
  .addNode("mistralChat", mistralChat)
  .addNode("geminiSearch", geminiSearch)
  .addEdge("__start__", "appData")
  .addEdge("appData", "groqClassify")
  .addEdge("groqClassify", "groqUIDecider")
  .addConditionalEdges("groqUIDecider", route)
  .addEdge("mistralChat", "__end__")
  .addEdge("geminiSearch", "__end__");

const memory = new MemorySaver();

export const graph = workflow.compile({
  checkpointer: memory,
});
