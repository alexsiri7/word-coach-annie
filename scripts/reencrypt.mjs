/**
 * Re-encrypt stored secrets from previous keys to the current ENCRYPTION_KEY
 * (#1282), and encrypt plaintext values written while ALLOW_PLAINTEXT_STORAGE
 * was set (#1323).
 *
 * Runs at container start after migrate.mjs (Dockerfile CMD), and can be run
 * by hand: `node scripts/reencrypt.mjs`. It is a no-op that never connects to
 * the database unless ENCRYPTION_KEY is set. Idempotent: values already under
 * the current key are left alone. Values no configured key can decrypt are
 * counted and left in place, never deleted.
 *
 * See "Rotating ENCRYPTION_KEY" in docs/SETUP.md.
 */

import { pathToFileURL } from 'url';
import {
  ENCRYPTED_COLUMNS,
  ENCRYPTED_PREFIX,
  decryptWithKeys,
  deriveKey,
  encryptWithKey,
  keySources,
} from './encryption-keyring.mjs';
import { quotedDatabaseSchema } from './database-schema.mjs';

/**
 * Sweep every column in ENCRYPTED_COLUMNS and rewrite values decrypted with a
 * previous key, and plaintext values, under the current key.
 *
 * @param {{ $queryRawUnsafe: Function, $executeRawUnsafe: Function }} prisma
 * @param {{ qschema: string, env: Record<string, string | undefined>, log?: Pick<Console, 'warn'> }} options
 *   qschema is the already-validated, ready-to-interpolate schema name
 * @returns {Promise<{ rewritten: number, encrypted: number, current: number, undecryptable: number }>}
 */
export async function reencryptStoredValues(prisma, { qschema, env, log = console }) {
  const { current, previous } = keySources(env);
  if (!current) throw new Error('ENCRYPTION_KEY is not set');
  const keys = [current, ...previous].map(deriveKey);
  const counts = { rewritten: 0, encrypted: 0, current: 0, undecryptable: 0 };

  // Compare-and-swap: a value the app replaced meanwhile is left alone.
  const replace = (table, column, id, value, plaintext) =>
    prisma.$executeRawUnsafe(
      `UPDATE ${qschema}."${table}" SET "${column}" = $1 WHERE "id" = $2 AND "${column}" = $3`,
      encryptWithKey(keys[0], plaintext),
      id,
      value,
    );

  for (const { table, columns } of ENCRYPTED_COLUMNS) {
    const select = columns.map((column) => `"${column}"`).join(', ');
    const rows = await prisma.$queryRawUnsafe(`SELECT "id", ${select} FROM ${qschema}."${table}"`);
    for (const row of rows) {
      for (const column of columns) {
        const value = row[column];
        if (!value) continue;
        if (!value.startsWith(ENCRYPTED_PREFIX)) {
          if ((await replace(table, column, row.id, value, value)) === 1) counts.encrypted++;
          continue;
        }
        const result = decryptWithKeys(value, keys);
        if (!result) {
          counts.undecryptable++;
          log.warn(`reencrypt: ${table}.${column} id=${row.id} could not be decrypted with any configured key`);
        } else if (result.keyIndex === 0) {
          counts.current++;
        } else if ((await replace(table, column, row.id, value, result.plaintext)) === 1) {
          counts.rewritten++;
        }
      }
    }
  }
  return counts;
}

async function main() {
  const { current, previous } = keySources(process.env);
  if (!current) {
    console.log('reencrypt: ENCRYPTION_KEY is not set — nothing to encrypt.');
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('reencrypt: DATABASE_URL is not set — skipping.');
    return;
  }
  const qschema = quotedDatabaseSchema(process.env);

  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) });
  try {
    const { rewritten, encrypted, current: onCurrent, undecryptable } = await reencryptStoredValues(prisma, {
      qschema,
      env: process.env,
    });
    console.log(
      `reencrypt: rewritten=${rewritten} encrypted=${encrypted} current=${onCurrent} undecryptable=${undecryptable}. ` +
        'Every decryptable value is now under the current key' +
        (previous.length > 0 ? ', so ENCRYPTION_KEY_PREVIOUS can be removed' : '') +
        '; undecryptable values belong to accounts that must be re-linked.',
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('reencrypt failed:', err);
    process.exit(1);
  });
}
