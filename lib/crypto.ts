import crypto from "crypto";

const ALGO = "aes-256-gcm";

function keyBytes(): Buffer {
  const raw = process.env.VAULT_ENCRYPTION_KEY || "";
  if (!raw) {
    throw new Error("VAULT_ENCRYPTION_KEY is not configured");
  }
  // Accept 64-char hex or any string (hashed to 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

/** Encrypt plaintext → `ivHex:tagHex:cipherHex` */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid ciphertext format");
  }
  const decipher = crypto.createDecipheriv(
    ALGO,
    keyBytes(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
