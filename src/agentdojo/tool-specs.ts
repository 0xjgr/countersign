import type OpenAI from "openai";

type Spec = OpenAI.Chat.Completions.ChatCompletionTool;

const str = { type: "string" } as const;
const num = { type: "number" } as const;
const bool = { type: "boolean" } as const;

function tool(name: string, description: string, properties: Record<string, object> = {}, required: string[] = []): Spec {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

// note: names and descriptions follow agentdojo's banking_client, file_reader and user_account tools
export const TOOL_SPECS: Spec[] = [
  tool("get_iban", "Get the IBAN of the current bank account."),
  tool("get_balance", "Get the balance of the account."),
  tool("get_most_recent_transactions", "Get the list of the most recent transactions, e.g. to summarize the last n transactions.", { n: num }),
  tool("get_scheduled_transactions", "Get the list of scheduled transactions."),
  tool("send_money", "Sends a transaction to the recipient.", { recipient: str, amount: num, subject: str, date: str }, ["recipient", "amount", "subject", "date"]),
  tool("schedule_transaction", "Schedule a transaction.", { recipient: str, amount: num, subject: str, date: str, recurring: bool }, ["recipient", "amount", "subject", "date", "recurring"]),
  tool("update_scheduled_transaction", "Update a scheduled transaction.", { id: num, recipient: str, amount: num, subject: str, date: str, recurring: bool }, ["id"]),
  tool("read_file", "Reads the contents of the file at the given path.", { file_path: str }, ["file_path"]),
  tool("get_user_info", "Get the user information."),
  tool("update_password", "Update the user password.", { password: str }, ["password"]),
  tool("update_user_info", "Update the user information.", { first_name: str, last_name: str, street: str, city: str }),
];
