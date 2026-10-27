/**
 * AES-256-GCM cipher for secrets stored in the database, with key rotation
 * (#1282).
 *
 * The single implementation of the "enc:v1:<iv-hex>:<ciphertext+tag-hex>"
 * format, shared by src/lib/crypto.ts (the app) and scripts/reencrypt.mjs (the
 * release-step sweep). Keep it import-free apart from Node's crypto: the
 * production image runs reencrypt.mjs without src/ or node_modules beyond
 * Prisma.
 *
 * ENCRYPTION_KEY is the current key and the only one used to encrypt.
 * ENCRYPTION_KEY_PREVIOUS lists older keys, comma-separated, used only to
 * decrypt values written before a rotation.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16;

export const ENCRYPTED_PREFIX = 'enc:v1:';

/**
 * Every column written with encrypt() must be listed here, or
 * scripts/reencrypt.mjs will not rotate it. Table and column names are the
 * Postgres identifiers from prisma/schema.prisma. src/lib/crypto.ts derives the
 * `field` its readers must name from this list, so a column read back without
 * being listed here does not type-check.
 */
export const ENCRYPTED_COLUMNS = /** @type {const} */ ([
  { table: 'GoogleCredential', columns: ['accessToken', 'refreshToken'] },
  { table: 'HashnodeCredential', columns: ['accessToken'] },
  { table: 'UserAiSettings', columns: ['apiKey'] },
  { table: 'AiSettings', columns: ['apiKey'] },
]);

/**
 * Derive a 256-bit key from a configured key string.
 *
 * @param {string} source
 * @returns {Buffer}
 */
export function deriveKey(source) {
  return createHash('sha256').update(source).digest();
}

/**
 * Read the configured key strings.
 *
 * @param {{ ENCRYPTION_KEY?: string, ENCRYPTION_KEY_PREVIOUS?: string }} env - Usually process.env
 * @returns {{ current: string | undefined, previous: string[] }}
 */
export function keySources(env) {
  const previous = (env.ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  return { current: env.ENCRYPTION_KEY || undefined, previous };
}

/**
 * @param {Buffer} key
 * @param {string} plaintext
 * @returns {string}
 */
export function encryptWithKey(key, plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const payload = Buffer.concat([encrypted, cipher.getAuthTag()]);
  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${payload.toString('hex')}`;
}

/**
 * Split an "enc:v1:" value into its parts, or null when it is malformed.
 *
 * @param {string} value
 * @returns {{ iv: Buffer, ciphertext: Buffer, tag: Buffer } | null}
 */
function parseEncrypted(value) {
  const parts = value.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 2) return null;
  const iv = Buffer.from(parts[0], 'hex');
  const payload = Buffer.from(parts[1], 'hex');
  if (payload.length < TAG_LENGTH) return null;
  return {
    iv,
    ciphertext: payload.subarray(0, payload.length - TAG_LENGTH),
    tag: payload.subarray(payload.length - TAG_LENGTH),
  };
}

/**
 * Decrypt an "enc:v1:" value with the first key that authenticates it.
 * keyIndex 0 is the current key; a higher index means the value should be
 * rewritten under the current key.
 *
 * @param {string} value
 * @param {Buffer[]} keys - Current key first, then previous keys
 * @returns {{ plaintext: string, keyIndex: number } | null} null when the value
 *   is malformed or no key authenticates it
 */
export function decryptWithKeys(value, keys) {
  const parsed = parseEncrypted(value);
  if (!parsed) return null;
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
    try {
      const decipher = createDecipheriv(ALGORITHM, keys[keyIndex], parsed.iv);
      decipher.setAuthTag(parsed.tag);
      const decrypted = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
      return { plaintext: decrypted.toString('utf8'), keyIndex };
    } catch {
      // Wrong key (or tampered value): try the next one.
    }
  }
  return null;
}
