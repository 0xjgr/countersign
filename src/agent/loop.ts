import type OpenAI from "openai";

import { MODEL, llm } from "./model.ts";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

export type ToolCall = { name: string; args: unknown; output: string };

export type AgentRun = { messages: Message[]; calls: ToolCall[]; answer: string };

const MAX_TURNS = 12;

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export async function runAgent(system: string, prompt: string, tools: Tool[], call: (name: string, args: unknown) => string): Promise<AgentRun> {
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: prompt },
  ];
  const calls: ToolCall[] = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await llm.chat.completions.create({ model: MODEL.LLM_MODEL, messages, tools, temperature: 0 });
    const reply = completion.choices[0]?.message;
    if (!reply) break;
    messages.push(reply);
    const requested = reply.tool_calls ?? [];
    if (requested.length === 0) return { messages, calls, answer: reply.content ?? "" };
    for (const request of requested) {
      if (request.type !== "function") continue;
      const args = parseArgs(request.function.arguments);
      const output = call(request.function.name, args);
      calls.push({ name: request.function.name, args, output });
      messages.push({ role: "tool", tool_call_id: request.id, content: output });
    }
  }
  return { messages, calls, answer: "" };
}
