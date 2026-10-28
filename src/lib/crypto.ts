/**
 * AES-256-GCM encryption for sensitive values stored in the database.
 *
 * ENCRYPTION_KEY is the current key: every new value is encrypted with it.
 * ENCRYPTION_KEY_PREVIOUS (optional, comma-separated) lists older keys that
 * still decrypt values written before a rotation; readEncrypted() rewrites
 * those under the current key. See "Rotating ENCRYPTION_KEY" in docs/SETUP.md.
 *
 * When ENCRYPTION_KEY is unset, throws by default and ENCRYPTION_KEY_PREVIOUS
 * is ignored. To allow plaintext storage in local dev, set
 * ALLOW_PLAINTEXT_STORAGE=true; production ignores it and refuses to start
 * while it is set (scripts/migrate.mjs).
 *
 * Encrypted format: "enc:v1:<iv-hex>:<ciphertext+tag-hex>"
 * (implemented in scripts/encryption-keyring.mjs).
 */
import {
    ENCRYPTED_COLUMNS,
    ENCRYPTED_PREFIX,
    decryptWithKeys,
    deriveKey,
    encryptWithKey,
    keySources,
} from "../../scripts/encryption-keyring.mjs";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

type FieldOf<C> = C extends { table: infer T extends string; columns: readonly (infer K extends string)[] }
    ? `${T}.${K}`
    : never;

/** A stored column registered in ENCRYPTED_COLUMNS, as "Table.column". */
export type EncryptedField = FieldOf<(typeof ENCRYPTED_COLUMNS)[number]>;

const UNDECRYPTABLE_WARNING =
    "[crypto] Stored value could not be decrypted with any configured key; treating as disconnected";

let encryptionWarningLogged = false;

/** Current key first, then previous keys; null when plaintext storage is allowed. */
function getKeyring(): Buffer[] | null {
    // Use only ENCRYPTION_KEY — do not reuse API_TOKEN as an encryption key.
    // API_TOKEN is an authentication bearer token; reusing it here would allow
    // key-confusion attacks if the token is rotated or leaked.
    const { current, previous } = keySources(env);
    if (!current) {
        if (process.env.ALLOW_PLAINTEXT_STORAGE !== "true" || process.env.NODE_ENV === "production") {
            throw new Error(
                "[crypto] ENCRYPTION_KEY must be set. " +
                "Generate one with: openssl rand -hex 32\n" +
                "To allow plaintext storage in local dev (never in production), set ALLOW_PLAINTEXT_STORAGE=true."
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
    return [current, ...previous].map(deriveKey);
}

/** Returns true if the value is already encrypted. */
export function isEncrypted(value: string): boolean {
    return value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypt a plaintext value with the current key. Returns the encrypted string.
 * Throws if no encryption key is available and ALLOW_PLAINTEXT_STORAGE is not set.
 * If ALLOW_PLAINTEXT_STORAGE=true and no key is set outside production, returns the plaintext unchanged.
 */
export function encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const keyring = getKeyring();
    if (!keyring) return plaintext;
    return encryptWithKey(keyring[0], plaintext);
}

/**
 * Decrypt an encrypted value with the current or a previous key. Returns the plaintext.
 * If the value is not encrypted (no prefix), returns it unchanged.
 * Throws if no configured key decrypts it.
 * Throws if no encryption key is available and ALLOW_PLAINTEXT_STORAGE is not set.
 * If ALLOW_PLAINTEXT_STORAGE=true and no key is set outside production, returns the raw value unchanged.
 */
export function decrypt(value: string): string {
    if (!value || !isEncrypted(value)) return value;

    const keyring = getKeyring();
    if (!keyring) return value;

    const parts = value.slice(ENCRYPTED_PREFIX.length).split(":");
    if (parts.length !== 2) {
        throw new Error(
            `[crypto] Malformed ciphertext (expected enc:v1:<iv>:<payload>, got ${parts.length} parts). ` +
            "This may indicate data corruption or an incomplete write."
        );
    }

    const result = decryptWithKeys(value, keyring);
    if (!result) {
        throw new Error(
            "[crypto] GCM authentication failed — ciphertext may be tampered or " +
            "was encrypted with a key that is neither ENCRYPTION_KEY nor in ENCRYPTION_KEY_PREVIOUS."
        );
    }
    return result.plaintext;
}

/**
 * Read a stored secret for use. Like decrypt(), but a value no configured key
 * can decrypt resolves to null (callers treat it as disconnected / no key)
 * instead of throwing, and a value decrypted with a previous key is passed,
 * re-encrypted under the current key, to `rewrite` so the caller can persist it.
 * A failed rewrite is logged and does not fail the read.
 *
 * `field` names the stored column in logs; the value itself is never logged.
 */
export async function readEncrypted(
    value: string,
    opts: { field: EncryptedField; rewrite?: (reencrypted: string) => Promise<unknown> }
): Promise<string | null> {
    if (!value || !isEncrypted(value)) return value;

    const keyring = getKeyring();
    if (!keyring) return value;

    const result = decryptWithKeys(value, keyring);
    if (!result) {
        logger.warn(UNDECRYPTABLE_WARNING, { field: opts.field });
        return null;
    }

    if (result.keyIndex > 0 && opts.rewrite) {
        try {
            await opts.rewrite(encryptWithKey(keyring[0], result.plaintext));
        } catch (err) {
            logger.warn("[crypto] Failed to rewrite stored value under the current key", {
                field: opts.field,
                error: err instanceof Error ? err.name : "unknown",
            });
        }
    }
    return result.plaintext;
}

/**
 * For connection-status checks: true when the stored value is encrypted and no
 * configured key decrypts it, so the caller can report it as disconnected.
 * Never throws and never rewrites. With ENCRYPTION_KEY unset it returns false,
 * so status checks report what they did before key rotation existed.
 */
export function isUndecryptable(value: string, field: EncryptedField): boolean {
    if (!value || !isEncrypted(value)) return false;
    const { current, previous } = keySources(env);
    if (!current) return false;
    if (decryptWithKeys(value, [current, ...previous].map(deriveKey))) return false;
    logger.warn(UNDECRYPTABLE_WARNING, { field });
    return true;
}
