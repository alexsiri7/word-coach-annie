/**
 * Report a production configuration that would serve every request
 * unauthenticated (#1256).
 *
 * Mirrors isAuthEnabled() in src/lib/auth.ts: auth is on when API_TOKEN or
 * GOOGLE_CLIENT_ID is non-empty. With neither, the middleware's local dev mode
 * passes every request through, so production must refuse to start instead.
 *
 * @param {Record<string, string | undefined>} env - Usually process.env
 * @returns {string[]} One message per problem; empty when auth is configured
 */
export function authConfigurationProblems(env) {
  if (env.API_TOKEN || env.GOOGLE_CLIENT_ID) return [];
  return [
    'neither API_TOKEN nor GOOGLE_CLIENT_ID is set; production requires authentication. ' +
      'Set API_TOKEN and/or GOOGLE_CLIENT_ID — see .env.example.',
  ];
}
