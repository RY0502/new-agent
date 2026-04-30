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
import * as path from "path";
import { A2uiSchemaManager, CatalogConfig, parseResponseToParts } from "./a2ui/schema-manager";
import { convertToLegacyFormat } from "./a2ui/component-converter";

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

const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 120000); // 2 minutes for low-memory systems
const LLM_TIMEOUT = Number(process.env.LLM_TIMEOUT || 90000);         // 90 seconds for LLM calls
const GROQ_TIMEOUT = Number(process.env.GROQ_TIMEOUT || 45000);       // 45 seconds for Groq

// Initialize A2UI v0.9 Schema Manager
const catalogConfig: CatalogConfig = {
  name: "chat-agent-custom",
  catalogPath: path.join(__dirname, "catalogs", "custom_catalog.json"),
  examplesPath: path.join(__dirname, "catalogs", "examples", "*.json")
};

const a2uiSchemaManager = new A2uiSchemaManager("0.9", [catalogConfig]);

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

function normalizeChartNumericValue(value: any): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;

  const raw = value.trim().toLowerCase();
  if (!raw) return 0;

  const unitMatch = raw.match(/^(-?[\d,.]+)\s*([kmbt%])?$/i);
  if (unitMatch) {
    const n = parseFloat(unitMatch[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) return 0;
    const u = unitMatch[2];
    if (u === "k") return n * 1e3;
    if (u === "m") return n * 1e6;
    if (u === "b") return n * 1e9;
    if (u === "t") return n * 1e12;
    return n;
  }

  const cleaned = raw.replace(/[^\d.-]/g, "");
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeChartComponents(components: any[]): any[] {
  if (!Array.isArray(components)) return components;

  return components.map((component) => {
    if (!component || typeof component !== "object") return component;
    const componentName = Object.keys(component)[0];
    if (componentName !== "Chart") return component;

    const chart = component.Chart || {};
    const data = Array.isArray(chart.data) ? chart.data : [];
    const normalizedData = data.map((point: any) => ({
      ...point,
      value: normalizeChartNumericValue(point?.value),
    }));

    return {
      ...component,
      Chart: {
        ...chart,
        data: normalizedData,
      },
    };
  });
}

// ─── A2UI v0.9 System ──────────────────────────────────────────────
// Legacy component definitions removed - now using A2UI v0.9 catalog system
// Component selection is handled automatically by the LLM via the catalog

// 1. Define our agent state
const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec,
  proverbs: Annotation<string[]>,
  needsSearch: Annotation<boolean>({
    value: (left, right) => (typeof right === "boolean" ? right : left),
    default: () => false,
  }),
  appEvent: Annotation<string>(),
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
    
    // Generate A2UI v0.9 system prompt
    const systemPrompt = a2uiSchemaManager.generateSystemPrompt(
      "You are a helpful assistant that can answer the given user query with the best of your knowledge. " +
      "CHART RULES: When user asks for chart/graph/plot/visualize/trend, use the Chart component and pick the right `type`: " +
      "• 'bar' → comparing discrete categories (population by country, revenue per region, votes per candidate). " +
      "• 'line' → trends over time (temperature, user growth, GDP). " +
      "• 'area' (alias 'worm') → stock prices, financial time series, sparklines, anything with a time axis where you want a filled trend look. " +
      "• 'pie' → parts of a whole when there are 2–6 segments (market share, budget split, demographics). " +
      "• 'donut' → same as pie but when a total in the center adds value. " +
      "For Chart.data, each point MUST include {label, value}. value MUST be a pure number (no units/symbols like B, M, %, commas, or text). " +
      "If needed, convert values to numeric before output. " +
      "COMPONENT SELECTION: " +
      "• Use Stat for KPIs / metrics / scores / summary numbers (always include trend up/down/flat when comparing). " +
      "• Use Timeline for histories / milestones / chronological events. " +
      "• Use Callout (variant: info|success|warning|error|quote) for tips, warnings, key insights, or quotes. " +
      "• Use Steps for tutorials / how-tos / processes. Mark current/done steps with status. " +
      "• Use Badges for tags / categories / technologies / quick keyword summaries. " +
      "Pick the most visually appropriate component instead of plain Result text whenever the data fits."
    );
    
    const reply = await withTimeout(
      mistral.invoke([
        ["system", systemPrompt],
        ["user", lastUser],
      ] as any),
      LLM_TIMEOUT,
      "Mistral API call"
    );
    
    let responseText = "";
    if (typeof reply.content === "string") {
      responseText = reply.content;
    } else if (Array.isArray(reply.content)) {
      const tp = (reply.content as any[]).find((p) => p?.type === "text");
      responseText = tp?.text ?? "";
    }
    
    // Parse A2UI v0.9 response
    const catalog = a2uiSchemaManager.getSelectedCatalog();
    const components = normalizeChartComponents(parseResponseToParts(responseText, catalog));
    
    // Convert to legacy format for existing renderer
    let text = convertToLegacyFormat(components);

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
    
    // Generate A2UI v0.9 system prompt with search-specific instructions
    const systemPrompt = a2uiSchemaManager.generateSystemPrompt(
      "You are an agent with real-time web search capabilities. You MUST use the googleSearch tool to fetch current, up-to-date information for EVERY query. " +
      "Do NOT rely on your training data - always perform a live web search first. " +
      "\n\nCOMPONENT SELECTION: " +
      "• Use Stat for KPIs / scores / summary numbers (with trend up/down/flat). " +
      "• Use Timeline for histories / milestones / chronological events. " +
      "• Use Callout (variant: info|success|warning|error|quote) for tips, warnings, key insights, or quotes. " +
      "• Use Steps for tutorials / how-tos / processes. Mark current/done steps with status. " +
      "• Use Badges for tags / categories / technologies / quick keyword summaries. " +
      "\n\nCHART RULES: When user asks for chart/graph/plot/visualize/trend, use Chart and pick `type`: " +
      "'bar' for category comparisons (population, revenue per region); " +
      "'line' for general trends over time; " +
      "'area' (or 'worm') for stock prices / financial time series / sparkline trends; " +
      "'pie' for parts of a whole (market share, budget split, 2–6 segments); " +
      "'donut' for pie + a total in the center. " +
      "data points are {label, value} where value MUST be numeric only (no units/symbols/text). Convert values before output. " +
      "\\n\\nIMAGE SEARCH: When users request images, search for HTTPS URLs from reliable sources (Imgur, Flickr, Reddit). " +
      "Avoid HTTP, Wikipedia, Unsplash, Pexels. URLs must end with image extensions (.jpg, .jpeg, .png, .gif, .webp). " +
      "\\n\\nVIDEO SEARCH: For videos, search YouTube with specific keywords. Extract 11-character video ID and use embed format: https://www.youtube.com/embed/VIDEO_ID. " +
      "Prioritize official sources (sports leagues, VEVO, news, education)."
    );
    
    const reply = await withTimeout(
      llm.invoke([
        ["system", systemPrompt],
        ["user", lastUser],
      ] as any),
      LLM_TIMEOUT,
      "Gemini API call"
    );
    
    let responseText = String(reply.content || reply.text || "");
    
    // Parse A2UI v0.9 response
    const catalog = a2uiSchemaManager.getSelectedCatalog();
    const components = normalizeChartComponents(parseResponseToParts(responseText, catalog));
    
    // Convert to legacy format for existing renderer
    let text = convertToLegacyFormat(components);
    
    console.log("=== GEMINI SEARCH A2UI v0.9 ===");
    console.log("Components parsed:", components.length);
    console.log("Legacy format length:", text.length);
    console.log("===============================");

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

// groqUIDecider removed - A2UI v0.9 handles component selection automatically via catalog and LLM

export const route = (
  state: any,
): "__end__" | "geminiSearch" | "mistralChat" => {
  return state.needsSearch ? "geminiSearch" : "mistralChat";
};

const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("appData", appData)
  .addNode("groqClassify", groqClassify)
  .addNode("mistralChat", mistralChat)
  .addNode("geminiSearch", geminiSearch)
  .addEdge("__start__", "appData")
  .addEdge("appData", "groqClassify")
  .addConditionalEdges("groqClassify", route)
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
