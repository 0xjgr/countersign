import OpenAI from "openai";
import { z } from "zod";

const ModelEnv = z.object({
  // note: any openai-compatible endpoint, NEAR AI Cloud in the hosted demo and ollama for local runs
  LLM_BASE_URL: z.url().default("http://localhost:11434/v1"),
  LLM_API_KEY: z.string().default("ollama"),
  LLM_MODEL: z.string().default("qwen3:8b"),
});

export const MODEL = ModelEnv.parse(process.env);

export const llm = new OpenAI({ baseURL: MODEL.LLM_BASE_URL, apiKey: MODEL.LLM_API_KEY });
