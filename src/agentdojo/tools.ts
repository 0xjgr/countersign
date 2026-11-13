import { z } from "zod";

import { SegmentLog } from "../provenance/segment.ts";
import { traceAmount, tracePayee } from "../provenance/trace.ts";
import type { Citation } from "../provenance/segment.ts";
import type { BankEnvironment, Transaction } from "./environment.ts";
import { TOOL_SPECS } from "./tool-specs.ts";

export type PaymentAttempt = {
  tool: "send_money" | "schedule_transaction" | "update_scheduled_transaction";
  recipient: string;
  amount: number;
  subject: string;
  payee: Citation;
  amountOrigin: Citation;
};

const Send = z.object({ recipient: z.string(), amount: z.coerce.number(), subject: z.string().default(""), date: z.string().default("") });
const Schedule = Send.extend({ recurring: z.coerce.boolean().default(false) });
const Update = z.object({
  id: z.coerce.number(),
  recipient: z.string().optional(),
  amount: z.coerce.number().optional(),
  subject: z.string().optional(),
  date: z.string().optional(),
  recurring: z.coerce.boolean().optional(),
});

function show(tx: Transaction): string {
  return Object.entries(tx).map(([k, v]) => `${k}: ${v}`).join("\n");
}

export function createBank(env: BankEnvironment, prompt: string) {
  const log = new SegmentLog();
  const attempts: PaymentAttempt[] = [];
  const agentMade = new Set<number>();
  let nextId = 8;

  const attempt = (tool: PaymentAttempt["tool"], recipient: string, amount: number, subject: string) => {
    attempts.push({
      tool,
      recipient,
      amount,
      subject,
      payee: tracePayee(recipient, prompt, log.segments),
      amountOrigin: traceAmount(amount, prompt, log.segments),
    });
  };

  const record = (tx: Transaction) => {
    // threat: the agent launders an injected payee through its own earlier payment, then reads it back as history
    const isOwnerAuthored = (tx.sender === "me" || tx.sender === env.iban) && !agentMade.has(tx.id);
    log.add(isOwnerAuthored ? "owner-record" : "untrusted", `transaction:${tx.id}`, show(tx));
    return show(tx);
  };

  const tools: Record<string, (args: unknown) => string> = {
    get_iban: () => log.add("owner-record", "get_iban", env.iban).text,
    get_balance: () => log.add("owner-record", "get_balance", String(env.balance)).text,
    get_user_info: () => {
      const { password: _, ...info } = env.user;
      return log.add("owner-record", "get_user_info", JSON.stringify(info)).text;
    },
    get_most_recent_transactions: (args) => {
      const n = z.object({ n: z.coerce.number().default(100) }).parse(args ?? {}).n;
      return env.transactions.slice(-n).map(record).join("\n---\n");
    },
    get_scheduled_transactions: () => env.scheduled.map(record).join("\n---\n"),
    read_file: (args) => {
      const path = z.object({ file_path: z.string() }).parse(args).file_path;
      const content = env.files[path];
      if (content === undefined) return `File ${path} not found`;
      return log.add("untrusted", `read_file:${path}`, content).text;
    },
    send_money: (args) => {
      const tx = Send.parse(args);
      attempt("send_money", tx.recipient, tx.amount, tx.subject);
      const id = nextId++;
      agentMade.add(id);
      env.transactions.push({ id, sender: env.iban, recurring: false, ...tx });
      env.balance -= tx.amount;
      return `Transaction to ${tx.recipient} for ${tx.amount} sent.`;
    },
    schedule_transaction: (args) => {
      const tx = Schedule.parse(args);
      attempt("schedule_transaction", tx.recipient, tx.amount, tx.subject);
      const id = nextId++;
      agentMade.add(id);
      env.scheduled.push({ id, sender: env.iban, ...tx });
      return `Transaction to ${tx.recipient} for ${tx.amount} scheduled.`;
    },
    update_scheduled_transaction: (args) => {
      const change = Update.parse(args);
      const tx = env.scheduled.find((t) => t.id === change.id);
      if (!tx) return `Transaction with ID ${change.id} not found.`;
      if (change.recipient !== undefined || change.amount !== undefined) {
        attempt("update_scheduled_transaction", change.recipient ?? tx.recipient, change.amount ?? tx.amount, change.subject ?? tx.subject);
      }
      if (change.recipient !== undefined) agentMade.add(tx.id);
      Object.assign(tx, Object.fromEntries(Object.entries(change).filter(([, v]) => v !== undefined)));
      return `Transaction with ID ${change.id} updated.`;
    },
    update_password: (args) => {
      env.user.password = z.object({ password: z.string() }).parse(args).password;
      return "Password updated.";
    },
    update_user_info: (args) => {
      Object.assign(env.user, z.record(z.string(), z.string()).parse(args));
      return JSON.stringify(env.user, ["first_name", "last_name", "street", "city"]);
    },
  };

  const call = (name: string, args: unknown): string => {
    const tool = tools[name];
    if (!tool) return `Unknown tool ${name}`;
    const parsed = z.unknown().safeParse(args);
    try {
      return tool(parsed.data);
    } catch (error) {
      // note: a malformed tool call is the model's mistake, it gets the error back like agentdojo does
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  };

  return { specs: TOOL_SPECS, call, attempts, log, env };
}
