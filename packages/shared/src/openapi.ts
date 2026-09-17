import { z } from "zod";
import { credits } from "./credits.js";
import { type Endpoint, endpoints } from "./endpoints.js";
import { errorBody, errorCodes } from "./errors.js";

type Json = Record<string, unknown>;

interface OpenApiOptions {
  serverUrl: string;
  version: string;
  billing: boolean;
}

/**
 * Builds an OpenAPI 3.1 document straight from the endpoint registry, so the
 * spec, request validation, SDK types and MCP tools can never drift apart.
 */
export function buildOpenApi({ serverUrl, version, billing }: OpenApiOptions) {
  const components: Record<string, Json> = {};

  const toSchema = (schema: z.ZodType, io: "input" | "output"): Json => {
    const json = z.toJSONSchema(schema, {
      io,
      target: "draft-2020-12",
      unrepresentable: "any",
      reused: "inline",
    }) as Json;
    const defs = (json.$defs ?? {}) as Record<string, Json>;
    delete json.$defs;
    delete json.$schema;
    const renames = new Map<string, string>();
    for (const [name, def] of Object.entries(defs)) {
      let key = name;
      if (components[key] && JSON.stringify(components[key]) !== JSON.stringify(def)) key = `${name}Output`;
      components[key] = def;
      renames.set(name, key);
    }
    const id = (json.id as string | undefined) ?? undefined;
    const rewritten = rewriteRefs(json, renames);
    if (id) {
      delete rewritten.id;
      let key = io === "output" && components[id] ? `${id}Output` : id;
      if (components[key] && JSON.stringify(components[key]) === JSON.stringify(rewritten)) key = id;
      components[key] = rewritten;
      return { $ref: `#/components/schemas/${key}` };
    }
    return rewritten;
  };

  const paths: Record<string, Record<string, Json>> = {};
  for (const e of Object.values(endpoints) as Endpoint[]) {
    const parameters: Json[] = [];
    for (const [where, schema] of [
      ["path", e.params],
      ["query", e.query],
    ] as const) {
      if (!schema) continue;
      type ObjectSchema = { properties?: Record<string, Json>; required?: string[]; $ref?: string; $defs?: Record<string, ObjectSchema> };
      let json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as ObjectSchema;
      if (json.$ref?.startsWith("#/$defs/")) json = json.$defs?.[json.$ref.slice(8)] ?? json;
      for (const [name, prop] of Object.entries(json.properties ?? {})) {
        parameters.push({
          name,
          in: where,
          required: where === "path" || (json.required ?? []).includes(name),
          description: prop.description,
          schema: prop,
        });
      }
    }

    const op: Json = {
      operationId: e.id,
      tags: [e.tag],
      summary: e.summary,
      description: billing ? `${e.description}\n\n**Cost:** ${e.cost}` : e.description,
      security: [{ bearer: [] }],
      parameters: parameters.length ? parameters : undefined,
      requestBody: e.body
        ? { required: true, content: { "application/json": { schema: toSchema(e.body, "input") } } }
        : undefined,
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["data", "meta"],
                properties: { data: toSchema(e.response, "output"), meta: { $ref: "#/components/schemas/Meta" } },
              },
            },
          },
        },
        ...Object.fromEntries(
          [...new Set(Object.values(errorCodes))].map((status) => [
            String(status),
            { $ref: "#/components/responses/Error" },
          ]),
        ),
      },
    };
    const pathItem = paths[e.path] ?? {};
    pathItem[e.method] = op;
    paths[e.path] = pathItem;
  }

  components.Meta = {
    type: "object",
    required: ["requestId", "creditsUsed", "cached", "durationMs"],
    properties: {
      requestId: { type: "string" },
      creditsUsed: { type: "integer" },
      cached: { type: "boolean" },
      durationMs: { type: "integer" },
    },
  };
  const errorSchema = z.toJSONSchema(errorBody, { unrepresentable: "any" }) as Json;
  delete errorSchema.$schema;
  delete errorSchema.id;
  components.Error = errorSchema;

  return {
    openapi: "3.1.1",
    info: {
      title: "Pluck API",
      version,
      description:
        "The web, as context for AI. Scrape, crawl, search, extract and monitor any website as clean, LLM-ready data.",
      license: { name: "AGPL-3.0-only", identifier: "AGPL-3.0-only" },
      "x-credits": billing ? credits : undefined,
    },
    servers: [{ url: serverUrl }],
    security: [{ bearer: [] }],
    tags: ["Scrape", "Crawl", "Search", "Extract", "Brand", "Monitors", "Account"].map((name) => ({ name })),
    paths,
    components: {
      schemas: components,
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "API key, e.g. `pk_live_...`" },
      },
      responses: {
        Error: {
          description: "Error",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
  };
}

function rewriteRefs(node: Json, renames: Map<string, string>): Json {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Json = {};
      for (const [k, v] of Object.entries(value)) {
        if (k === "$ref" && typeof v === "string" && v.startsWith("#/$defs/")) {
          const name = v.slice("#/$defs/".length);
          out[k] = `#/components/schemas/${renames.get(name) ?? name}`;
        } else {
          out[k] = walk(v);
        }
      }
      return out;
    }
    return value;
  };
  return walk(node) as Json;
}
