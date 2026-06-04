import * as crypto from "node:crypto";
import { ENCRYPTION_KEY_ENV } from "./config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const keyEnv = process.env[ENCRYPTION_KEY_ENV] || "datanova-default-key-32b!";
  // Pad or truncate to 32 bytes for AES-256
  const keyBuffer = Buffer.alloc(32);
  const inputBuffer = Buffer.from(keyEnv, "utf-8");
  inputBuffer.copy(keyBuffer, 0, 0, Math.min(inputBuffer.length, 32));
  return keyBuffer;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "iv:tag:ciphertext" as hex strings.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt ciphertext encrypted with encrypt().
 * Input format: "iv:tag:ciphertext" as hex strings.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(dataHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length");
  }
  if (tag.length !== TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}
