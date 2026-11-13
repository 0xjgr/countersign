import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";

import { CHAIN } from "../chain/config.ts";
import { readMandate } from "../chain/guard.ts";
import { OWNER_REQUEST, runAttempt } from "./attempt.ts";
import { readBoard, recordAttempt } from "./board.ts";
import { admitAttempt } from "./limits.ts";

const AttemptBody = z.object({ invoice: z.string().trim().min(10).max(2000) });
const PAGE = readFileSync("web/index.html", "utf8");

const app = new Hono();

app.get("/", (c) => c.html(PAGE));

app.get("/api/setup", async (c) => {
  const mandate = await readMandate();
  return c.json({ ownerRequest: OWNER_REQUEST, guard: CHAIN.GUARD_ID, agent: CHAIN.AGENT_ID, mandate });
});

app.get("/api/board", (c) => c.json(readBoard()));

app.post("/api/attempt", async (c) => {
  const body = AttemptBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Write an invoice between 10 and 2000 characters." }, 400);
  const client = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const admitted = admitAttempt(client);
  if (!admitted.ok) return c.json({ error: admitted.error }, 429);
  const report = await runAttempt(body.data.invoice);
  recordAttempt(report);
  console.log(`[web] attempt id=${report.id} payments=${report.payments.length} verdicts=${report.payments.map((p) => p.verdict.kind).join(",") || "none"}`);
  return c.json(report);
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`[web] listening port=${port} guard=${CHAIN.GUARD_ID}`);
