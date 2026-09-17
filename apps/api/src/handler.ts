import type { LlmTasks } from "@pluck/ai";
import type { EndpointId, EndpointOutput, Endpoints } from "@pluck/shared";
import type { z } from "zod";
import type { Caller } from "./auth.js";
import type { Services } from "./services.js";

type Parsed<T> = T extends z.ZodType ? z.output<T> : unknown;

export type HandlerInput<K extends EndpointId> = (Endpoints[K] extends { body: infer B } ? Parsed<B> : unknown) &
  (Endpoints[K] extends { query: infer Q } ? Parsed<Q> : unknown) &
  (Endpoints[K] extends { params: infer P } ? Parsed<P> : unknown);

export interface HandlerContext {
  s: Services;
  caller: Caller;
  requestId: string;
  /** LLM tasks bound to this caller's credentials (headers > saved keys > instance key). */
  llm: LlmTasks;
  signal: AbortSignal;
}

export interface HandlerResult<K extends EndpointId> {
  data: EndpointOutput<K>;
  /** Actual credits consumed. */
  credits: number;
  cached?: boolean;
  status?: number;
}

export interface EndpointHandler<K extends EndpointId> {
  /** Credits to reserve before running; settled against `credits` afterwards. */
  estimate: (input: HandlerInput<K>) => number;
  run: (ctx: HandlerContext, input: HandlerInput<K>) => Promise<HandlerResult<K>>;
  /** Target URL/domain recorded in usage logs. */
  target?: (input: HandlerInput<K>) => string | undefined;
}

export type HandlerMap = { [K in EndpointId]: EndpointHandler<K> };

export const handler = <K extends EndpointId>(_id: K, h: EndpointHandler<K>) => h;
