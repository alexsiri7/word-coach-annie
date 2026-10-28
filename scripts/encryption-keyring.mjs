/**
 * AES-256-GCM cipher for secrets stored in the database, with key rotation
 * (#1282).
 *
 * The single implementation of the ciphertext format, shared by src/lib/crypto.ts (the app), scripts/reencrypt.mjs (the
 * release-step sweep) and scripts/migrate.mjs (the startup gate). Keep it import-free apart from Node's crypto: the
 * production image runs reencrypt.mjs without src/ or node_modules beyond
 * Prisma.
 *
 * ENCRYPTION_KEY is the current key and the only one used to encrypt.
 * ENCRYPTION_KEY_PREVIOUS lists older keys, comma-separated, used only to
 * decrypt values written before a rotation.
 *
 * Format: "enc:v2:<key-id>:<iv-hex>:<ciphertext+tag-hex>", where key-id names
 * the key that encrypted it (see keyId). Values written before #1323 use
 * "enc:v1:<iv-hex>:<ciphertext+tag-hex>"; they still decrypt, by trying every
 * configured key, and are rewritten as v2.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16;

/** Every stored value starting with this is ciphertext; anything else is plaintext. */
export const ENCRYPTED_PREFIX = 'enc:';
const V1_PREFIX = 'enc:v1:';
const V2_PREFIX = 'enc:v2:';

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
 * Report a production configuration that opts out of encryption (#1323).
 *
 * ALLOW_PLAINTEXT_STORAGE=true lets local dev run without ENCRYPTION_KEY.
 * src/lib/crypto.ts ignores it in production, and the startup gate in
 * migrate.mjs refuses to start while it is set there.
 *
 * @param {{ ALLOW_PLAINTEXT_STORAGE?: string }} env - Usually process.env
 * @returns {string[]} One message per problem; empty when encryption is not opted out
 */
export function plaintextStorageProblems(env) {
  if (env.ALLOW_PLAINTEXT_STORAGE !== 'true') return [];
  return [
    'ALLOW_PLAINTEXT_STORAGE=true is set; production never stores credentials unencrypted. ' +
      'Unset it and set ENCRYPTION_KEY — see docs/SETUP.md.',
  ];
}

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
 * A short public identifier for a derived key: a truncated hash of it, so it
 * names the key without revealing it.
 *
 * @param {Buffer} key
 * @returns {string} 8 hex characters
 */
export function keyId(key) {
  return createHash('sha256').update('key-id:').update(key).digest('hex').slice(0, 8);
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
  return `${V2_PREFIX}${keyId(key)}:${iv.toString('hex')}:${payload.toString('hex')}`;
}

/**
 * Split an encrypted value into its parts, or null when it is malformed or of
 * an unknown version. kid is null for v1 values, which carry no key id.
 *
 * @param {string} value
 * @returns {{ kid: string | null, iv: Buffer, ciphertext: Buffer, tag: Buffer } | null}
 */
export function parseEncrypted(value) {
  let kid = null;
  let parts;
  if (value.startsWith(V2_PREFIX)) {
    parts = value.slice(V2_PREFIX.length).split(':');
    if (parts.length !== 3) return null;
    kid = parts.shift();
  } else if (value.startsWith(V1_PREFIX)) {
    parts = value.slice(V1_PREFIX.length).split(':');
    if (parts.length !== 2) return null;
  } else {
    return null;
  }
  const iv = Buffer.from(parts[0], 'hex');
  const payload = Buffer.from(parts[1], 'hex');
  if (payload.length < TAG_LENGTH) return null;
  return {
    kid,
    iv,
    ciphertext: payload.subarray(0, payload.length - TAG_LENGTH),
    tag: payload.subarray(payload.length - TAG_LENGTH),
  };
}

/**
 * Decrypt an encrypted value. A v2 value is tried only with the configured key
 * its key id names; a v1 value with each key in turn.
 *
 * keyIndex 0 is the current key. stale is true when the value should be
 * rewritten with encryptWithKey(keys[0], plaintext): it was encrypted with a
 * previous key, or it is in the v1 format.
 *
 * @param {string} value
 * @param {Buffer[]} keys - Current key first, then previous keys
 * @returns {{ plaintext: string, keyIndex: number, stale: boolean } | null} null
 *   when the value is malformed or no key authenticates it
 */
export function decryptWithKeys(value, keys) {
  const parsed = parseEncrypted(value);
  if (!parsed) return null;
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
    if (parsed.kid !== null && keyId(keys[keyIndex]) !== parsed.kid) continue;
    try {
      const decipher = createDecipheriv(ALGORITHM, keys[keyIndex], parsed.iv);
      decipher.setAuthTag(parsed.tag);
      const decrypted = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
      return { plaintext: decrypted.toString('utf8'), keyIndex, stale: keyIndex > 0 || parsed.kid === null };
    } catch {
      // Wrong key (or tampered value): try the next one.
    }
  }
  return null;
}
