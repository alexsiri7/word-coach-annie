/**
 * Report production secrets too short to resist brute force (#1315).
 *
 * JWT_SECRET signs session cookies, API_TOKEN authenticates API/MCP requests
 * and ENCRYPTION_KEY seeds the at-rest key for stored AI API keys; a short
 * value lets one captured token or ciphertext be cracked offline. Unset (or
 * empty) secrets are other gates' concern. MIN_SECRET_LENGTH is also enforced
 * by resolveJwtSecret() in src/lib/auth.ts. Keep it import-free: the Edge
 * middleware bundles auth.ts.
 */
export const MIN_SECRET_LENGTH = 32;

const SECRETS = ['JWT_SECRET', 'API_TOKEN', 'ENCRYPTION_KEY'];

/**
 * @param {{ JWT_SECRET?: string, API_TOKEN?: string, ENCRYPTION_KEY?: string }} env - Usually process.env
 * @returns {string[]} One message per secret that is set but too short
 */
export function secretStrengthProblems(env) {
  return SECRETS.filter((name) => env[name] && env[name].length < MIN_SECRET_LENGTH).map(
    (name) =>
      `${name} is shorter than ${MIN_SECRET_LENGTH} characters. ` +
      'Generate one with: openssl rand -hex 32',
  );
}
