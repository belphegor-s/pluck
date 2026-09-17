import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for provider keys at rest. The 32-byte key is derived from
 * `PLUCK_ENCRYPTION_KEY` so any sufficiently long secret works.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret || secret.length < 32) throw new Error("PLUCK_ENCRYPTION_KEY must be at least 32 characters");
    this.key = createHash("sha256").update(secret).digest();
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${data.toString("base64")}`;
  }

  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(":");
    if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  }
}

export const keyHint = (key: string) => (key.length <= 8 ? "••••" : `${key.slice(0, 4)}…${key.slice(-4)}`);
