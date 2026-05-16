/**
 * AES-256-GCM encryption for sensitive values stored in the database.
 *
 * Uses ENCRYPTION_KEY env var (or falls back to API_TOKEN).
 * When neither is set, throws by default. To allow plaintext storage in
 * local dev, set ALLOW_PLAINTEXT_STORAGE=true.
 *
 * Encrypted format: "enc:v1:<iv-hex>:<ciphertext+tag-hex>"
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const PREFIX = "enc:v1:";

let encryptionWarningLogged = false;

function getEncryptionKey(): Buffer | null {
    const keySource = env.ENCRYPTION_KEY || env.API_TOKEN;
    if (!keySource) {
        if (process.env.ALLOW_PLAINTEXT_STORAGE !== "true") {
            throw new Error(
                "[crypto] ENCRYPTION_KEY or API_TOKEN must be set. " +
                "To allow plaintext storage in local dev, set ALLOW_PLAINTEXT_STORAGE=true."
            );
        }
        if (!encryptionWarningLogged) {
            console.warn(
                "[crypto] No ENCRYPTION_KEY or API_TOKEN set — " +
                "encryption is disabled, values stored as plaintext. " +
                "(ALLOW_PLAINTEXT_STORAGE=true)"
            );
            encryptionWarningLogged = true;
        }
        return null;
    }
    // Derive a 256-bit key from the source using SHA-256
    return createHash("sha256").update(keySource).digest();
}

/** Returns true if the value is already encrypted. */
export function isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
}

/**
 * Encrypt a plaintext value. Returns the encrypted string.
 * If no encryption key is available, returns the plaintext unchanged.
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const key = getEncryptionKey();
    if (!key) return plaintext;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([encrypted, tag]);

    return `${PREFIX}${iv.toString("hex")}:${payload.toString("hex")}`;
}

/**
 * Decrypt an encrypted value. Returns the plaintext.
 * If the value is not encrypted (no prefix), returns it unchanged.
 * If no encryption key is available, returns the raw value.
 */
export function decrypt(value: string): string {
    if (!value || !isEncrypted(value)) return value;

    const key = getEncryptionKey();
    if (!key) return value;

    const parts = value.slice(PREFIX.length).split(":");
    if (parts.length !== 2) return value;

    const iv = Buffer.from(parts[0], "hex");
    const payload = Buffer.from(parts[1], "hex");

    // Last 16 bytes are the GCM auth tag
    const tag = payload.subarray(payload.length - 16);
    const ciphertext = payload.subarray(0, payload.length - 16);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString("utf8");
}
