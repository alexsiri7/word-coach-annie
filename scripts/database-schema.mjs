/**
 * DATABASE_SCHEMA names the schema holding the app's tables (and the
 * _prisma_migrations bookkeeping table). Unset means `public`, which is what
 * staging and local development use. The one validation rule for it, shared
 * by src/lib/db.ts, migrate.mjs and reencrypt.mjs: it is interpolated into raw
 * SQL, so it must be a plain identifier.
 */

/**
 * @param {Record<string, string | undefined>} env - Usually process.env
 * @returns {string | undefined} the configured schema, or undefined when unset
 * @throws when DATABASE_SCHEMA is not a plain SQL identifier
 */
export function configuredDatabaseSchema(env) {
  const schema = env.DATABASE_SCHEMA?.trim();
  if (!schema) return undefined;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`DATABASE_SCHEMA must be a plain SQL identifier, got ${JSON.stringify(schema)}`);
  }
  return schema;
}

/**
 * @param {Record<string, string | undefined>} env - Usually process.env
 * @returns {string} the schema, ready to interpolate before `."Table"`
 * @throws when DATABASE_SCHEMA is not a plain SQL identifier
 */
export function quotedDatabaseSchema(env) {
  const schema = configuredDatabaseSchema(env) ?? 'public';
  // `public` stays unquoted so the emitted SQL is unchanged for existing deploys.
  return schema === 'public' ? 'public' : `"${schema}"`;
}
