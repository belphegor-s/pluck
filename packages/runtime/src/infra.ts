import { promisify } from "node:util";
import { zstdCompress, zstdDecompress } from "node:zlib";
import { AwsClient } from "aws4fetch";
import { Redis } from "ioredis";
import { type Logger as PinoLogger, pino } from "pino";
import type { AssetStore } from "@pluck/core";
import type { Config } from "./config.js";

export type Logger = PinoLogger;

export function createLogger(config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">, name: string): Logger {
  return pino({
    name,
    level: config.LOG_LEVEL,
    base: { service: name },
    redact: {
      paths: ["req.headers.authorization", "req.headers['x-llm-key']", "*.apiKey", "*.encryptedKey"],
      censor: "[redacted]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export function createRedis(url: string, { forQueue }: { forQueue: boolean }): Redis {
  return new Redis(url, {
    // BullMQ requires `null` so blocking commands never time out.
    maxRetriesPerRequest: forQueue ? null : 2,
    enableReadyCheck: true,
    lazyConnect: false,
    connectionName: forQueue ? "pluck-queue" : "pluck-cache",
  });
}

const compress = promisify(zstdCompress);
const decompress = promisify(zstdDecompress);

/** zstd-compressed JSON cache. Web pages compress ~8-15x. */
export class JsonCache {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "c:",
  ) {}

  async get<T>(key: string): Promise<{ value: T; storedAt: number } | null> {
    const raw = await this.redis.getBuffer(this.prefix + key);
    if (!raw || raw.length < 8) return null;
    try {
      const storedAt = Number(raw.readBigUInt64BE(0));
      const value = JSON.parse((await decompress(raw.subarray(8))).toString("utf8")) as T;
      return { value, storedAt };
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    const header = Buffer.alloc(8);
    header.writeBigUInt64BE(BigInt(Date.now()));
    const body = await compress(Buffer.from(JSON.stringify(value)));
    await this.redis.set(this.prefix + key, Buffer.concat([header, body]), "EX", ttlSeconds);
  }
}

/** Sliding-ish fixed window limiter; one round trip per request. */
export async function rateLimit(redis: Redis, key: string, limit: number, windowSeconds = 60) {
  if (limit <= 0) return { allowed: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const k = `rl:${key}:${bucket}`;
  const [[, count]] = (await redis.multi().incr(k).expire(k, windowSeconds + 1).exec()) as [[null, number], unknown];
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    reset: (bucket + 1) * windowSeconds,
  };
}

/** S3-compatible object storage (R2, S3, MinIO) with SigV4 via aws4fetch. */
export class S3Store implements AssetStore {
  private readonly client: AwsClient;

  constructor(
    private readonly opts: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; publicUrl?: string },
  ) {
    this.client = new AwsClient({ accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey, region: opts.region, service: "s3" });
  }

  static fromConfig(c: Config): S3Store | null {
    if (!c.S3_ENDPOINT || !c.S3_BUCKET || !c.S3_ACCESS_KEY_ID || !c.S3_SECRET_ACCESS_KEY) return null;
    return new S3Store({
      endpoint: c.S3_ENDPOINT,
      region: c.S3_REGION,
      bucket: c.S3_BUCKET,
      accessKeyId: c.S3_ACCESS_KEY_ID,
      secretAccessKey: c.S3_SECRET_ACCESS_KEY,
      publicUrl: c.STORAGE_PUBLIC_URL,
    });
  }

  private objectUrl(key: string) {
    return `${this.opts.endpoint.replace(/\/$/, "")}/${this.opts.bucket}/${key}`;
  }

  publicUrl(key: string): string {
    return this.opts.publicUrl ? `${this.opts.publicUrl.replace(/\/$/, "")}/${key}` : this.objectUrl(key);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    const res = await this.client.fetch(this.objectUrl(key), {
      method: "PUT",
      body: new Uint8Array(body),
      headers: { "content-type": contentType, "cache-control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`Storage PUT failed: HTTP ${res.status}`);
    return this.publicUrl(key);
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string | null } | null> {
    const res = await this.client.fetch(this.objectUrl(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage GET failed: HTTP ${res.status}`);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
  }
}
