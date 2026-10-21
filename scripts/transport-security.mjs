const DB_TLS_MODES = new Set(['require', 'verify-ca', 'verify-full', 'no-verify']);

/**
 * Report the production database and Redis URLs that would carry traffic
 * unencrypted (#1251).
 *
 * DATABASE_URL must name an sslmode that always encrypts. For Supabase that is
 * `sslmode=require&uselibpqcompat=true`: without `uselibpqcompat`, pg treats
 * `require` as verify-full, which rejects Supabase's private CA. REDIS_URL, when
 * set, must use the `rediss://` scheme.
 *
 * Messages name only the offending sslmode or scheme, never the URL, which
 * carries the password.
 *
 * @param {Record<string, string | undefined>} env - Usually process.env
 * @returns {string[]} One message per problem; empty when both are acceptable
 */
export function transportSecurityProblems(env) {
  const problems = [];

  if (env.DATABASE_URL) {
    // Read sslmode the way pg does: the fragment is not part of the query, and
    // a repeated parameter takes its last value.
    const [beforeFragment] = env.DATABASE_URL.split('#');
    const queryStart = beforeFragment.indexOf('?');
    const query = queryStart === -1 ? '' : beforeFragment.slice(queryStart + 1);
    const sslmode = new URLSearchParams(query).getAll('sslmode').at(-1)?.toLowerCase();
    if (!DB_TLS_MODES.has(sslmode)) {
      const found = sslmode === undefined ? 'has no sslmode' : `has sslmode=${sslmode}`;
      problems.push(
        `DATABASE_URL ${found}; production requires TLS. ` +
          'Append sslmode=require&uselibpqcompat=true (Supabase) — see .env.example.',
      );
    }
  }

  // "Set" means what src/lib/rate-limit.ts means by it: any non-empty value.
  const redisUrl = env.REDIS_URL;
  if (redisUrl && !/^rediss:\/\//i.test(redisUrl)) {
    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(redisUrl)?.[1];
    const found = scheme === undefined ? 'has no scheme' : `uses ${scheme}://`;
    problems.push(
      `REDIS_URL ${found}; production requires rediss:// (TLS). ` +
        'Use a rediss:// URL, or unset REDIS_URL to use the in-memory rate limiter.',
    );
  }

  return problems;
}
