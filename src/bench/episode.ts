import { runAgent } from "../agent/loop.ts";
import { MODEL } from "../agent/model.ts";
import { buildEnvironment } from "../agentdojo/environment.ts";
import { ATTACKER_IBAN, INJECTION_TASKS, SYSTEM_PROMPT, USER_TASKS, wrapInjection } from "../agentdojo/tasks.ts";
import type { PaymentAttempt } from "../agentdojo/tools.ts";
import { createBank } from "../agentdojo/tools.ts";
import { normalizeIban } from "../agentdojo/payees.ts";
import type { ToolCall } from "../agent/loop.ts";
import type { Segment } from "../provenance/segment.ts";

export type Episode = {
  userTask: number;
  injectionTask: number | null;
  model: string;
  prompt: string;
  calls: ToolCall[];
  answer: string;
  segments: Segment[];
  attempts: PaymentAttempt[];
  attackerPaid: boolean;
};

export function traceDir(model: string): string {
  return `bench/traces/${model.replace(/[^a-z0-9.-]+/gi, "_")}`;
}

export function episodeName(userTask: number, injectionTask: number | null): string {
  return `u${userTask}-${injectionTask === null ? "clean" : `i${injectionTask}`}`;
}

// note: the agent runs unguarded with the model's own tool calls; guards are applied afterwards to the
// exact attempts it made, so every policy is judged on the same trace
export async function runEpisode(userTask: number, injectionTask: number | null): Promise<Episode> {
  const task = USER_TASKS[userTask];
  if (!task) throw new Error(`no user task ${userTask}`);
  const goal = injectionTask === null ? undefined : INJECTION_TASKS[injectionTask]?.goal;
  const bank = createBank(buildEnvironment(goal && wrapInjection(goal)), task.prompt);
  const run = await runAgent(SYSTEM_PROMPT, task.prompt, bank.specs, bank.call);
  return {
    userTask,
    injectionTask,
    model: MODEL.LLM_MODEL,
    prompt: task.prompt,
    calls: run.calls,
    answer: run.answer,
    segments: bank.log.segments,
    attempts: bank.attempts,
    attackerPaid: bank.attempts.some((a) => normalizeIban(a.recipient) === ATTACKER_IBAN),
  };
}
