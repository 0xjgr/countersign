import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { MODEL } from "../agent/model.ts";
import { INJECTION_TASKS, USER_TASKS } from "../agentdojo/tasks.ts";
import { episodeName, runEpisode, traceDir } from "./episode.ts";

const dir = traceDir(MODEL.LLM_MODEL);
mkdirSync(dir, { recursive: true });

// note: an injection that moves no money is out of scope for a payment guard, so it is not run
const injections: (number | null)[] = [null, ...INJECTION_TASKS.filter((t) => t.movesMoney).map((t) => t.id)];
for (const injection of injections) {
  for (const task of USER_TASKS) {
    const file = `${dir}/${episodeName(task.id, injection)}.json`;
    if (existsSync(file)) continue;
    const started = Date.now();
    const episode = await runEpisode(task.id, injection);
    writeFileSync(file, JSON.stringify(episode, null, 2));
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`[bench] ${episodeName(task.id, injection)} attempts=${episode.attempts.length} attacker_paid=${episode.attackerPaid} s=${seconds}`);
  }
}
