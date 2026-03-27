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
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGoogle } from "@langchain/google";
import { ChatGroq } from "@langchain/groq";

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

const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 45000);
const LLM_TIMEOUT = Number(process.env.LLM_TIMEOUT || 30000);
const GROQ_TIMEOUT = Number(process.env.GROQ_TIMEOUT || 15000);

let mistralInstance: ChatMistralAI | null = null;
let geminiInstance: ChatGoogle | null = null;
let groqInstance: ChatGroq | null = null;

function getMistralClient(): ChatMistralAI {
  if (!mistralInstance) {
    mistralInstance = new ChatMistralAI({ 
      model: "mistral-large-latest",
      maxRetries: 1
    });
  }
  return mistralInstance;
}

function getGeminiClient(): ChatGoogle {
  const key1 = process.env.GOOGLE_API_KEY;
  const key2 = process.env.ANOTHER_GOOGLE_API_KEY;
  
  // Round-robin between keys
  const apiKey = keyToggle ? key1 : (key2 || key1);
  keyToggle = !keyToggle;
  
  console.log(`[Gemini] Using API key: ${apiKey?.substring(0, 10)}... (toggle: ${!keyToggle})`);
  
  // Create new instance with selected API key for true round-robin
  const client = new ChatGoogle({
    model: "gemini-2.5-flash",
    apiKey: apiKey,
    maxRetries: 1
  }).bindTools([
    {
      googleSearch: {},
    },
  ]) as ChatGoogle;
  
  return client;
}

function getGroqClient(): ChatGroq {
  if (!groqInstance) {
    groqInstance = new ChatGroq({
      model: "openai/gpt-oss-120b",
      temperature: 0,
      maxRetries: 1
    });
  }
  return groqInstance;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
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
  image: {
    tag: "a2-image",
    schema: [
      "<a2-image> — renders an image with responsive sizing and optional fit modes.",
      'Inner content MUST be a valid JSON object: { "id": string, "component": { "Image": { "url": { "literalString": string }, "fit": "cover" | "contain" | "fill", "usageHint": "hero" | "thumbnail" | "icon" | "content" } } }.',
      "The URL must be a direct link to an image file (jpg, png, gif, webp, svg).",
      'fit: "cover" (default) - fills container, may crop; "contain" - fits entire image; "fill" - stretches to fill',
      'usageHint: "hero" - large banner; "thumbnail" - small preview; "icon" - small icon; "content" - inline content',
      "When searching for images, use Google Search to find relevant, high-quality images.",
    ].join("\n"),
    example: [
      "<section>Answer</section>",
      '<a2-image>{"id": "hero", "component": { "Image": { "url": { "literalString": "https://example.com/hero.png" }, "fit": "cover", "usageHint": "hero" } } }</a2-image>',
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
  try {
    const mistral = getMistralClient();
    const lastUser = getLastUserText(state.messages as any);
    const sel = (state.selectedUI || "result").toLowerCase();
    const a2uiPrompt = buildA2UISystemPrompt(sel, state.selectedUISchema || "");
    
    const reply = await withTimeout(
      mistral.invoke([
        ["system", "You are a helpful assistant that can answer the given user query with the best of your knowledge."],
        ["system", a2uiPrompt],
        ["user", lastUser],
      ] as any),
      LLM_TIMEOUT,
      "Mistral API call"
    );
    
    let text = "";
    if (typeof reply.content === "string") {
      text = reply.content;
    } else if (Array.isArray(reply.content)) {
      const tp = (reply.content as any[]).find((p) => p?.type === "text");
      text = tp?.text ?? "";
    }

    const finalLogs = state.logs || [];
    if (finalLogs.length > 0) {
      text = `<status>\n${finalLogs.join("\n")}\n</status>\n\n${text}`;
    }

    return { messages: [new AIMessage(text)] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Mistral chat error:", errorMsg);
    return { 
      messages: [new AIMessage(`<section>Error</section><a2-result>Unable to process request: ${errorMsg}. Please try again.</a2-result>`)] 
    };
  }
};

let keyToggle = true;

const geminiSearch = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> => {
  try {
    const llm = getGeminiClient();
    const lastUser = getLastUserText(state.messages as any);
    const sel = (state.selectedUI || "result").toLowerCase();
    const a2uiPrompt = buildA2UISystemPrompt(sel, state.selectedUISchema || "");
    
    const reply = await withTimeout(
      llm.invoke([
        ["system", "You are an agent with real-time web search capabilities. You MUST use the googleSearch tool to fetch current, up-to-date information for EVERY query. Do NOT rely on your training data - always perform a live web search first."],
        ["system", "CRITICAL: Always invoke the googleSearch tool before answering. Search for the most relevant and recent information related to the user's query."],
        ["system", "IMAGE SEARCH REQUIREMENTS:\n- When users request images, perform a REAL-TIME web search to find current, working image URLs\n- CRITICAL REQUIREMENTS:\n  * URL MUST use HTTPS (not HTTP) - browsers block insecure HTTP images\n  * URL MUST end with image extension: .jpg, .jpeg, .png, .gif, .webp\n  * URL must be accessible and not expired/404\n- Search for RECENT images: Add 'after:2023' to search queries to find latest content\n- Search query format: '[subject] after:2023 site:imgur.com OR site:flickr.com'\n- PRIORITIZE these sources in order:\n  1. Imgur direct links: https://i.imgur.com/[id].jpg (most reliable, HTTPS, no expiration)\n  2. Flickr static CDN: https://live.staticflickr.com (permanent HTTPS URLs)\n  3. Major news/media sites with HTTPS CDN URLs\n  4. Reddit image hosting: https://i.redd.it (reliable, HTTPS)\n- AVOID these problematic sources:\n  * Any HTTP URLs (not HTTPS) - will be blocked by browser\n  * Wikipedia/Wikimedia (CORS issues, often 404)\n  * Unsplash/Pexels (URLs often expire or require auth)\n  * Pinterest (redirects, not direct images)\n  * Social media (require authentication)\n- If you cannot find a reliable HTTPS direct image URL after searching, use RESULT component with Google Images link\n- Example GOOD: https://i.imgur.com/abc123.jpg\n- Example GOOD: https://live.staticflickr.com/65535/12345_abc_b.jpg\n- Example BAD: http://example.com/image.jpg (HTTP not HTTPS)\n- Example BAD: Any URL without image extension"],
        ["system", "VIDEO SEARCH REQUIREMENTS:\n- When users request videos, you MUST search YouTube with SPECIFIC keywords matching the user's request\n- Search query format: 'site:youtube.com [exact user request keywords]'\n- Example: User asks 'Lionel Messi skills video' → Search: 'site:youtube.com Lionel Messi skills'\n- CRITICAL: Verify the video title/description matches the user's request before using it\n- Extract the 11-character video ID from search results (format: youtube.com/watch?v=VIDEO_ID)\n- Convert to embed URL format: https://www.youtube.com/embed/VIDEO_ID\n- Prioritize official sources: sports leagues (NBA, FIFA, La Liga), music labels (VEVO), news (BBC, CNN), education (TED)\n- DO NOT use random/unrelated videos - the video content MUST match what the user asked for\n- ALWAYS use the video component with proper JSON format\n- Example response: <section>Answer</section><a2-video>{\"id\": \"video-1\", \"component\": { \"Video\": { \"url\": { \"literalString\": \"https://www.youtube.com/embed/abc12345678\" } } }}</a2-video>\n- If you cannot find a relevant video, use RESULT component with explanation instead"],
        ["system", a2uiPrompt],
        ["user", lastUser],
      ] as any),
      LLM_TIMEOUT,
      "Gemini API call"
    );
    
    let text = String(reply.content || reply.text || "");
    
    // Log the raw agent response for debugging
    console.log("=== GEMINI SEARCH RAW RESPONSE ===");
    console.log("Selected UI:", sel);
    console.log("Response length:", text.length);
    console.log("Response content:", text);
    console.log("=================================");

    // Validate image URLs if this is an image response
    if (sel === "image" && text.includes("<a2-image>")) {
      const imageUrlPattern = /"literalString":\s*"([^"]+)"/;
      const match = text.match(imageUrlPattern);
      
      if (match) {
        const imageUrl = match[1];
        console.log("Extracted image URL:", imageUrl);
        
        // Check for problematic URL patterns
        const isHTTP = imageUrl.startsWith("http://");
        const isWikipedia = imageUrl.includes("wikipedia.org") || imageUrl.includes("wikimedia.org");
        const isUnsplashPexels = imageUrl.includes("unsplash.com") || imageUrl.includes("pexels.com");
        const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(imageUrl);
        const isImgur = imageUrl.includes("i.imgur.com") && hasImageExtension;
        const isFlickr = imageUrl.includes("staticflickr.com") && hasImageExtension;
        const isReddit = imageUrl.includes("i.redd.it") && hasImageExtension;
        const isReliableSource = isImgur || isFlickr || isReddit;
        
        console.log("Is HTTP (not HTTPS)?", isHTTP);
        console.log("Is Wikipedia/Wikimedia?", isWikipedia);
        console.log("Is Unsplash/Pexels?", isUnsplashPexels);
        console.log("Has image extension?", hasImageExtension);
        console.log("Is reliable source (Imgur/Flickr/Reddit)?", isReliableSource);
        
        // Block problematic sources
        if (isHTTP || isWikipedia || isUnsplashPexels || (!hasImageExtension && !isReliableSource)) {
          if (isHTTP) {
            console.warn("Blocked HTTP image URL (browsers require HTTPS):", imageUrl);
          } else {
            console.warn("Detected problematic image URL:", imageUrl);
          }
          const searchQuery = encodeURIComponent(lastUser + " image");
          const searchUrl = `https://www.google.com/search?q=${searchQuery}&tbm=isch`;
          
          text = `<section>Answer</section><a2-result>I searched for images of "${lastUser}" but couldn't find a secure (HTTPS) direct image URL. <a href="${searchUrl}" target="_blank" style="color: #4f46e5; text-decoration: underline;">Click here to view images on Google</a>.</a2-result>`;
        } else {
          console.log("Image URL looks valid, keeping original response");
        }
      }
    }
    
    // Log video response for debugging
    if (sel === "video" && text.includes("<a2-video>")) {
      const videoIdPattern = /https:\/\/www\.youtube\.com\/embed\/([A-Za-z0-9_-]{11})/;
      const match = text.match(videoIdPattern);
      if (match) {
        console.log("Video embed URL found:", match[0]);
      }
    }

    const finalLogs = state.logs || [];
    if (finalLogs.length > 0) {
      text = `<status>\n${finalLogs.join("\n")}\n</status>\n\n${text}`;
    }

    return { messages: [new AIMessage(text)] };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("Gemini search error:", errorMsg);
    return { 
      messages: [new AIMessage(`<section>Error</section><a2-result>Unable to fetch search results: ${errorMsg}. Please try again.</a2-result>`)] 
    };
  }
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
  try {
    const groq = getGroqClient();
    const res = await withTimeout(
      groq.invoke([
        ["system", 'Classify if the query requires real-time web data (SEARCH) or can be answered by training data (NO_SEARCH). Output ONLY JSON: {"needs_search": boolean, "reason": "string"}'],
        ["user", getLastUserText(state.messages as any)],
      ] as any),
      GROQ_TIMEOUT,
      "Groq classify"
    );
    
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
    } catch (parseError) {
      console.error("Failed to parse Groq classification response", parseError);
      needsSearch = false;
    }
    
    const rawMsg = needsSearch ? "Routing: SEARCH" : "Routing: NO_SEARCH";
    await copilotKitEmitMessage(_config, `<status>${rawMsg}</status>`);
    return {
      needsSearch,
      logs: [...(state.logs || []), rawMsg],
    };
  } catch (error) {
    console.error("Groq classify error:", error);
    const rawMsg = "Routing: NO_SEARCH (fallback)";
    await copilotKitEmitMessage(_config, `<status>${rawMsg}</status>`);
    return {
      needsSearch: false,
      logs: [...(state.logs || []), rawMsg],
    };
  }
};

const groqUIDecider = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig
): Promise<typeof AgentStateAnnotation.Update> => {
  try {
    const groq = getGroqClient();
    const userText = getLastUserText(state.messages as any);
    const startMsg = "Determining the display format";
    await copilotKitEmitMessage(_config, `<status>${startMsg}</status>`);

    const prompt = [
      "You are a UI display selector. Choose the single best A2UI component for rendering the answer to the user query.",
      'Allowed components: "tabs", "table", "list", "result", "code", "video", "image".',
      "Selection rules:",
      '- User explicitly asks for a "table" or "tabular format" -> "table"',
      '- Comparison queries -> "tabs" (e.g., "react vs angular", "compare SAML and OAuth")',
      '- Multi-attribute/statistics -> "table" (e.g., "Weather in Delhi today")',
      '- Summarized, scannable bullet-like facts -> "list" (e.g., "Lionel Messi kids")',
      '- General details or when unsure -> "result"',
      '- Code output -> "code" (e.g., "write a Python function to ...")',
      '- Video, clips or youtube requests -> "video"',
      '- Image, photo, picture, or visual requests -> "image" (e.g., "show me Eiffel Tower", "picture of sunset")',
      'Output ONLY JSON: {"component": "<one_of_allowed>", "reason": "<short why>"}.',
      "Query: " + userText,
    ].join("\n");
    
    const res = await withTimeout(
      groq.invoke([
        ["system", "Select the best single component according to the rules."],
        ["user", prompt],
      ] as any),
      GROQ_TIMEOUT,
      "Groq UI decider"
    );
    
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
      if (cand === "img" || cand === "pic" || cand === "picture" || cand === "photo") cand = "image";
      if (["tabs", "table", "list", "result", "code", "video", "image"].includes(cand)) component = cand;
    } catch (parseError) {
      console.error("Failed to parse UI component selection", parseError);
    }

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
  } catch (error) {
    console.error("Groq UI decider error:", error);
    const startMsg = "Determining the display format";
    const selectedMsg = "Selected **result** for rendering (fallback)";
    await copilotKitEmitMessage(_config, `<status>${selectedMsg}</status>`);
    
    const def = COMPONENT_DEFINITIONS["result"];
    const selectedUISchema = [
      "--- SELECTED A2UI COMPONENT ---",
      "Component: <" + def.tag + ">",
      def.schema,
      "",
      "--- EXAMPLE OUTPUT ---",
      def.example,
      "--- END ---",
    ].join("\n");
    
    return {
      selectedUI: "result",
      selectedUISchema,
      logs: [...(state.logs || []), startMsg, selectedMsg],
    };
  }
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

class LimitedMemorySaver extends MemorySaver {
  private maxCheckpoints: number;
  private checkpointCounts: Map<string, number> = new Map();
  private checkpointTracker: Map<string, any> = new Map();

  constructor(maxCheckpoints: number = 5) {
    super();
    this.maxCheckpoints = maxCheckpoints;
  }

  async put(config: RunnableConfig, checkpoint: any, metadata: any): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id || "default";
    
    // Track checkpoint count for this thread
    const count = this.checkpointCounts.get(threadId) || 0;
    this.checkpointCounts.set(threadId, count + 1);
    
    // Store checkpoint metadata with thread-specific key
    const key = `${threadId}:${checkpoint.id}`;
    this.checkpointTracker.set(key, { checkpoint, metadata, timestamp: Date.now() });
    
    // Clean up old checkpoints if limit exceeded
    if (count >= this.maxCheckpoints) {
      this.cleanupOldCheckpoints(threadId);
    }
    
    return super.put(config, checkpoint, metadata);
  }

  private cleanupOldCheckpoints(threadId: string) {
    // Get all checkpoints for this thread
    const threadCheckpoints: Array<{ key: string; timestamp: number }> = [];
    
    for (const [key, value] of this.checkpointTracker.entries()) {
      if (key.startsWith(`${threadId}:`)) {
        threadCheckpoints.push({ key, timestamp: value.timestamp });
      }
    }
    
    // Sort by timestamp (oldest first)
    threadCheckpoints.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest checkpoints beyond the limit
    const toRemove = threadCheckpoints.length - this.maxCheckpoints;
    if (toRemove > 0) {
      for (let i = 0; i < toRemove; i++) {
        this.checkpointTracker.delete(threadCheckpoints[i].key);
      }
      console.log(`Cleaned up ${toRemove} old checkpoint(s) for thread ${threadId}`);
    }
  }
}

const MAX_CHECKPOINT_HISTORY = Number(process.env.MAX_CHECKPOINT_HISTORY || 5);
const memory = new LimitedMemorySaver(MAX_CHECKPOINT_HISTORY);

export const graph = workflow.compile({
  checkpointer: memory,
});
