/**
 * This is the main entry point for the agent.
 * It defines the workflow graph, state, tools, nodes and edges.
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { CopilotKitStateAnnotation } from "@copilotkit/sdk-js/langchain";
import { copilotKitEmitMessage, copilotKitEmitState } from "@copilotkit/sdk-js/langchain";
import { Annotation } from "@langchain/langgraph";

function getLastUserText(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const m = messages[messages.length - 1];
  const c = (m as any)?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const tp = c.find((p) => p?.type === "text");
    if (tp?.text) return String(tp.text);
    return c.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join(" ").trim();
  }
  return "";
}

// 1. Define our agent state, which includes CopilotKit state to
//    provide actions to the state.
const AgentStateAnnotation = Annotation.Root({
  ...CopilotKitStateAnnotation.spec, // CopilotKit state annotation already includes messages, as well as frontend tools
  proverbs: Annotation<string[]>,
  needsSearch: Annotation<boolean>({
    value: (left, right) => (typeof right === "boolean" ? right : left),
    default: () => false,
  }),
  appEvent: Annotation<string>(),
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
  const reply = await mistral.invoke([
    ["system", "You are a helpful assistant that can answer the given user query with the best of your knowledge"],
    ["user", lastUser],
  ] as any);
  let text = "";
  if (typeof reply.content === "string") {
    text = reply.content;
  } else if (Array.isArray(reply.content)) {
    const tp = (reply.content as any[]).find((p) => p?.type === "text");
    text = tp?.text ?? "";
  }
  return {
    messages: [new AIMessage(text)],
  };
};

const geminiSearch = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof AgentStateAnnotation.Update> => {
  const { ChatGoogle } = await import("@langchain/google");
  const llm = new ChatGoogle("gemini-2.5-flash")
  .bindTools([
    {
      googleSearch: {},
    },
  ]);
  const lastUser =
    getLastUserText(state.messages as any);
  const reply = await llm.invoke([
    ["system", "Use search to fetch current information."],
    ["user", lastUser],
  ] as any);
   return {
    messages: [new AIMessage(reply.text)],
  };
};

const appData = async (
  _config: RunnableConfig
): Promise<typeof AgentStateAnnotation.Update> => {
  const appEvent = "Classifying search intent";
  await copilotKitEmitMessage(_config, appEvent);
  return {appEvent};
}

const groqClassify = async (
  state: typeof AgentStateAnnotation.State,
  _config: RunnableConfig
): Promise<typeof AgentStateAnnotation.Update> => {
  const { ChatGroq } = await import("@langchain/groq");
  const groq = new ChatGroq({ 
    model: "openai/gpt-oss-120b",
    temperature: 0,
    maxRetries: 2});
  const res = await groq.invoke([
    ["system", `Classify if the query requires real-time web data (SEARCH) or can be answered by training data (NO_SEARCH). Output ONLY JSON: {"needs_search": boolean, "reason": "string"}`],
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
  const statusMsg = needsSearch ? "Routing: SEARCH" : "Routing: NO_SEARCH";
  await copilotKitEmitMessage(_config, statusMsg);
  await copilotKitEmitState(_config, { needsSearch, reason });
  return { needsSearch };
};

/**
 * Routing function: Determines whether to continue research or end the builder.
 * This function decides if the gathered information is satisfactory or if more research is needed.
 *
 * @param state - The current state of the research builder
 * @returns Either "callModel" to continue research or END to finish the builder
 */
export const route = (
  state: any,
): "__end__" | "geminiSearch" | "mistralChat" => {
  return state.needsSearch ? "geminiSearch" : "mistralChat";
};


// Finally, create the graph itself.
const workflow = new StateGraph(AgentStateAnnotation)
  // Add the nodes to do the work.
  // Chaining the nodes together in this way
  // updates the types of the StateGraph instance
  // so you have static type checking when it comes time
  // to add the edges.
  .addNode("appData", appData)
  .addNode("groqClassify", groqClassify)
  .addNode("mistralChat", mistralChat)
  .addNode("geminiSearch", geminiSearch)
  // Regular edges mean "always transition to node B after node A is done"
  // The "__start__" and "__end__" nodes are "virtual" nodes that are always present
  // and represent the beginning and end of the builder.
  .addEdge("__start__", "appData")
  .addEdge("appData", "groqClassify")
  // Conditional edges optionally route to different nodes (or end)
  .addConditionalEdges("groqClassify", route)
  .addEdge("mistralChat", "__end__")
  .addEdge("geminiSearch", "__end__");

const memory = new MemorySaver();

export const graph = workflow.compile({
  checkpointer: memory,
});
