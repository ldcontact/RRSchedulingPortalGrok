import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * App-level AES-256-GCM for QuickBooks tokens at rest. Key: QBO_TOKEN_ENC_KEY,
 * 32 bytes as base64 (44 chars) or hex (64 chars). Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
export function parseEncKey(raw: string): Buffer {
  const v = raw.trim();
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) key = Buffer.from(v, "hex");
  else {
    try { key = Buffer.from(v, "base64"); } catch { key = null; }
  }
  if (!key || key.length !== 32) throw new Error("QBO_TOKEN_ENC_KEY must be 32 bytes (base64 or 64 hex characters).");
  return key;
}

export function encryptToken(plain: string, rawKey: string): string {
  const key = parseEncKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptToken(sealed: string, rawKey: string): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || ct == null) throw new Error("Stored QuickBooks token is in an unknown format.");
  const key = parseEncKey(rawKey);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
