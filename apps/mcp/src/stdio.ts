#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BRAND } from "@pluck/shared";
import { createMcpServer } from "./server.js";

const apiKey = process.env.PLUCK_API_KEY;
if (!apiKey) {
  console.error(`PLUCK_API_KEY is required. Create one at ${BRAND.siteUrl}/dashboard/keys`);
  process.exit(1);
}

const llmHeaders: Record<string, string> = {};
if (process.env.PLUCK_LLM_PROVIDER) llmHeaders["x-llm-provider"] = process.env.PLUCK_LLM_PROVIDER;
if (process.env.PLUCK_LLM_KEY) llmHeaders["x-llm-key"] = process.env.PLUCK_LLM_KEY;
if (process.env.PLUCK_LLM_MODEL) llmHeaders["x-llm-model"] = process.env.PLUCK_LLM_MODEL;

const server = createMcpServer({
  apiUrl: process.env.PLUCK_API_URL ?? BRAND.apiUrl,
  apiKey,
  llmHeaders,
});
await server.connect(new StdioServerTransport());
