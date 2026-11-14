import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { declareIntent, payThroughGuard, readMandate, setMandate } from "../chain/guard.ts";
import { transferUnguarded } from "../chain/unguarded.ts";
import { accountForIban, unitsToYocto } from "../agentdojo/payees.ts";
import { citationLabel } from "../provenance/trace.ts";
import { MODEL } from "../agent/model.ts";
import { MODES } from "./anchor-types.ts";
import type { Anchor, Mode } from "./anchor-types.ts";
import { episodeName } from "./episode.ts";
import { anchorFile, loadEpisodes } from "./store.ts";
import type { Episode } from "./episode.ts";
import { PER_PAYMENT_CAP_UNITS, benchMandate } from "./mandate.ts";

const FULL_ACCESS_CEILING_YOCTO = 10n ** 24n;

const file = anchorFile(MODEL.LLM_MODEL);
const anchors: Anchor[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
const done = new Set(anchors.map((a) => `${a.episode}/${a.attempt}/${a.mode}`));
const save = () => writeFileSync(file, JSON.stringify(anchors, null, 2));

async function anchorAttempt(mode: Mode, episode: Episode, index: number): Promise<Anchor> {
  const name = episodeName(episode.userTask, episode.injectionTask);
  const attempt = episode.attempts[index]!;
  const payee = accountForIban(attempt.recipient);
  const yocto = unitsToYocto(attempt.amount);
  const run = `agentdojo-banking:${name}:a${index}:${mode}:${MODEL.LLM_MODEL}`;
  const base = { episode: name, attempt: index, mode, payee, yocto: yocto.toString() };

  if (mode === "full-access") {
    // note: a full access key can only move what the account holds, so an amount above the ceiling is sent as the ceiling
    const sent = yocto > FULL_ACCESS_CEILING_YOCTO ? FULL_ACCESS_CEILING_YOCTO : yocto;
    const txHash = await transferUnguarded(payee, sent);
    const clamped = sent === yocto ? {} : { sentYocto: sent.toString() };
    return { ...base, ...clamped, citation: "none", verdict: { kind: "allow" }, txHash };
  }
  let intentTx: string | undefined;
  let intentId: string | undefined;
  // note: the owner's client declares an intent for each payee the owner typed, signed with the owner's key
  if (mode === "provenance" && attempt.payee.kind === "owner-prompt") {
    const intent = await declareIntent(payee, unitsToYocto(PER_PAYMENT_CAP_UNITS), 30);
    intentId = intent.id;
    intentTx = intent.txHash;
  }
  const citation = citationLabel(attempt.payee, intentId);
  const settlement = await payThroughGuard(payee, yocto, { payee: citation, amount: citationLabel(attempt.amountOrigin) }, run);
  return { ...base, citation, verdict: settlement.verdict, txHash: settlement.txHash, intentTx };
}

const episodes = loadEpisodes(MODEL.LLM_MODEL);
for (const mode of MODES) {
  if (mode !== "full-access" && (await readMandate()).policy !== mode) {
    console.log(`[anchor] mandate policy=${mode} tx=${await setMandate(benchMandate(mode))}`);
  }
  for (const episode of episodes) {
    for (let index = 0; index < episode.attempts.length; index++) {
      const key = `${episodeName(episode.userTask, episode.injectionTask)}/${index}/${mode}`;
      if (done.has(key)) continue;
      // note: a negative amount moves nothing on chain, so it is not a payment any guard has to judge
      if (episode.attempts[index]!.amount < 0) {
        console.log(`[anchor] skip ${key} amount=${episode.attempts[index]!.amount} reason=negative-amount`);
        continue;
      }
      // note: the public testnet rpc rate limits bursts, a short pause keeps a long run alive
      await new Promise((resolve) => setTimeout(resolve, 400));
      const anchor = await anchorAttempt(mode, episode, index);
      anchors.push(anchor);
      done.add(key);
      save();
      console.log(`[anchor] ${key} payee=${anchor.payee} citation=${anchor.citation} verdict=${anchor.verdict.kind} tx=${anchor.txHash}`);
    }
  }
}
