/**
 * AES-256-GCM encryption for sensitive values stored in the database.
 *
 * Uses ENCRYPTION_KEY env var exclusively.
 * When unset, throws by default. To allow plaintext storage in
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
    // Use only ENCRYPTION_KEY — do not reuse API_TOKEN as an encryption key.
    // API_TOKEN is an authentication bearer token; reusing it here would allow
    // key-confusion attacks if the token is rotated or leaked.
    const keySource = env.ENCRYPTION_KEY;
    if (!keySource) {
        if (process.env.ALLOW_PLAINTEXT_STORAGE !== "true") {
            throw new Error(
                "[crypto] ENCRYPTION_KEY must be set. " +
                "Generate one with: openssl rand -hex 32\n" +
                "To allow plaintext storage in local dev, set ALLOW_PLAINTEXT_STORAGE=true."
            );
        }
        if (!encryptionWarningLogged) {
            console.warn(
                "[crypto] No ENCRYPTION_KEY set — " +
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
 * Throws if no encryption key is available and ALLOW_PLAINTEXT_STORAGE is not set.
 * If ALLOW_PLAINTEXT_STORAGE=true and no key is set, returns the plaintext unchanged.
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
 * Throws if no encryption key is available and ALLOW_PLAINTEXT_STORAGE is not set.
 * If ALLOW_PLAINTEXT_STORAGE=true and no key is set, returns the raw value unchanged.
 */
export function decrypt(value: string): string {
    if (!value || !isEncrypted(value)) return value;

    const key = getEncryptionKey();
    if (!key) return value;

    const parts = value.slice(PREFIX.length).split(":");
    if (parts.length !== 2) {
        throw new Error(
            `[crypto] Malformed ciphertext (expected enc:v1:<iv>:<payload>, got ${parts.length} parts). ` +
            "This may indicate data corruption or an incomplete write."
        );
    }

    const iv = Buffer.from(parts[0], "hex");
    const payload = Buffer.from(parts[1], "hex");

    // Last 16 bytes are the GCM auth tag
    const tag = payload.subarray(payload.length - 16);
    const ciphertext = payload.subarray(0, payload.length - 16);

    let decrypted: Buffer;
    try {
        const decipher = createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (e) {
        throw new Error(
            "[crypto] GCM authentication failed — ciphertext may be tampered or ENCRYPTION_KEY may have changed. " +
            `Original: ${(e as Error).message}`
        );
    }

    return decrypted.toString("utf8");
}
