import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { testPrisma } from '../../src/__tests__/setup';
import { decryptWithKeys, deriveKey, encryptWithKey } from '../encryption-keyring.mjs';
import { reencryptStoredValues } from '../reencrypt.mjs';

const REENCRYPT_SCRIPT = join(__dirname, '../reencrypt.mjs');
const KEY_A = 'reencrypt-key-a';
const KEY_B = 'reencrypt-key-b';
const KEY_C = 'reencrypt-key-unknown';
const env = { ENCRYPTION_KEY: KEY_B, ENCRYPTION_KEY_PREVIOUS: KEY_A };
const quietLog = { warn: vi.fn() };

function decryptUnderOnly(key: string, value: string) {
  return decryptWithKeys(value, [deriveKey(key)])?.plaintext;
}

describe('reencryptStoredValues()', () => {
  it('rewrites previous-key values under the current key, leaves unknown ones, and is idempotent', async () => {
    const a = deriveKey(KEY_A);
    await testPrisma.googleCredential.create({
      data: {
        userId: 'local',
        accessToken: encryptWithKey(a, 'access'),
        refreshToken: encryptWithKey(a, 'refresh'),
        expiresAt: new Date(),
        scope: '',
      },
    });
    await testPrisma.aiSettings.create({ data: { id: 'default', apiKey: encryptWithKey(a, 'sk-global') } });
    const unknown = encryptWithKey(deriveKey(KEY_C), 'hashnode-token');
    await testPrisma.hashnodeCredential.create({
      data: { userId: 'local', accessToken: unknown, publicationId: 'p', username: 'u' },
    });

    await expect(reencryptStoredValues(testPrisma, { qschema: 'public', env, log: quietLog })).resolves.toEqual({
      rewritten: 3,
      encrypted: 0,
      current: 0,
      undecryptable: 1,
    });

    const cred = await testPrisma.googleCredential.findUniqueOrThrow({ where: { userId: 'local' } });
    expect(decryptUnderOnly(KEY_B, cred.accessToken)).toBe('access');
    expect(decryptUnderOnly(KEY_B, cred.refreshToken)).toBe('refresh');
    const settings = await testPrisma.aiSettings.findUniqueOrThrow({ where: { id: 'default' } });
    expect(decryptUnderOnly(KEY_B, settings.apiKey)).toBe('sk-global');
    const hashnode = await testPrisma.hashnodeCredential.findUniqueOrThrow({ where: { userId: 'local' } });
    expect(hashnode.accessToken).toBe(unknown);
    expect(JSON.stringify(quietLog.warn.mock.calls)).not.toContain(unknown);

    await expect(reencryptStoredValues(testPrisma, { qschema: 'public', env, log: quietLog })).resolves.toEqual({
      rewritten: 0,
      encrypted: 0,
      current: 3,
      undecryptable: 1,
    });
  });

  it('leaves a value replaced between its read and its rewrite alone', async () => {
    const a = deriveKey(KEY_A);
    const user = await testPrisma.user.create({ data: { email: 'race@example.com', googleId: 'g-race' } });
    await testPrisma.userAiSettings.create({ data: { userId: user.id, apiKey: encryptWithKey(a, 'sk-stale') } });
    const concurrent = encryptWithKey(a, 'sk-saved-meanwhile');
    // A settings save lands after the sweep's SELECT and before its UPDATE.
    const racing = {
      $queryRawUnsafe: async (sql: string) => {
        const rows = await testPrisma.$queryRawUnsafe(sql);
        if (sql.includes('"UserAiSettings"')) {
          await testPrisma.userAiSettings.update({ where: { userId: user.id }, data: { apiKey: concurrent } });
        }
        return rows;
      },
      $executeRawUnsafe: testPrisma.$executeRawUnsafe.bind(testPrisma),
    };

    await expect(reencryptStoredValues(racing, { qschema: 'public', env, log: quietLog })).resolves.toEqual({
      rewritten: 0,
      encrypted: 0,
      current: 0,
      undecryptable: 0,
    });
    const settings = await testPrisma.userAiSettings.findUniqueOrThrow({ where: { userId: user.id } });
    expect(settings.apiKey).toBe(concurrent);
  });

  it('encrypts plaintext values under the current key, leaves empty ones, and is idempotent', async () => {
    const onlyCurrent = { ENCRYPTION_KEY: KEY_B };
    await testPrisma.googleCredential.create({
      data: { userId: 'local', accessToken: 'access-plain', refreshToken: 'refresh-plain', expiresAt: new Date(), scope: '' },
    });
    await testPrisma.hashnodeCredential.create({
      data: { userId: 'local', accessToken: 'hashnode-plain', publicationId: 'p', username: 'u' },
    });
    await testPrisma.aiSettings.create({ data: { id: 'default', apiKey: 'sk-legacy-plaintext' } });
    const user = await testPrisma.user.create({ data: { email: 'u@example.com', googleId: 'g-1' } });
    await testPrisma.userAiSettings.create({ data: { userId: user.id, apiKey: '' } });

    await expect(reencryptStoredValues(testPrisma, { qschema: 'public', env: onlyCurrent, log: quietLog })).resolves.toEqual({
      rewritten: 0,
      encrypted: 4,
      current: 0,
      undecryptable: 0,
    });

    const cred = await testPrisma.googleCredential.findUniqueOrThrow({ where: { userId: 'local' } });
    expect(decryptUnderOnly(KEY_B, cred.accessToken)).toBe('access-plain');
    expect(decryptUnderOnly(KEY_B, cred.refreshToken)).toBe('refresh-plain');
    const hashnode = await testPrisma.hashnodeCredential.findUniqueOrThrow({ where: { userId: 'local' } });
    expect(decryptUnderOnly(KEY_B, hashnode.accessToken)).toBe('hashnode-plain');
    const settings = await testPrisma.aiSettings.findUniqueOrThrow({ where: { id: 'default' } });
    expect(settings.apiKey.startsWith('enc:v1:')).toBe(true);
    expect(decryptUnderOnly(KEY_B, settings.apiKey)).toBe('sk-legacy-plaintext');
    const userSettings = await testPrisma.userAiSettings.findUniqueOrThrow({ where: { userId: user.id } });
    expect(userSettings.apiKey).toBe('');
    expect(JSON.stringify(quietLog.warn.mock.calls)).not.toContain('plain');

    await expect(reencryptStoredValues(testPrisma, { qschema: 'public', env: onlyCurrent, log: quietLog })).resolves.toEqual({
      rewritten: 0,
      encrypted: 0,
      current: 4,
      undecryptable: 0,
    });
  });
});

describe('reencrypt.mjs as a script', () => {
  it('skips without connecting when ENCRYPTION_KEY is unset', () => {
    const result = spawnSync('node', [REENCRYPT_SCRIPT], {
      // Port 1 refuses connections, so any connection attempt would fail the run.
      env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/x', ENCRYPTION_KEY: '', ENCRYPTION_KEY_PREVIOUS: KEY_A },
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing to encrypt');
  });

  // Plaintext values need the sweep even when no key is being rotated out.
  it.each([
    ['with ENCRYPTION_KEY_PREVIOUS', env],
    ['without ENCRYPTION_KEY_PREVIOUS', { ENCRYPTION_KEY: KEY_B, ENCRYPTION_KEY_PREVIOUS: '' }],
  ])('sweeps, and exits non-zero when the sweep fails, %s', (_, keys) => {
    const result = spawnSync('node', [REENCRYPT_SCRIPT], {
      env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/x', ...keys },
      encoding: 'utf-8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('reencrypt failed');
  });

  // The CMD swallows reencrypt.mjs failures, so a missing module would fail silently.
  it('is shipped in the image with its local imports', () => {
    const dockerfile = readFileSync(join(__dirname, '../../Dockerfile'), 'utf-8');
    const imports = [...readFileSync(REENCRYPT_SCRIPT, 'utf-8').matchAll(/from '\.\/([\w-]+\.mjs)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['encryption-keyring.mjs', 'database-schema.mjs']);
    for (const file of ['reencrypt.mjs', ...imports]) {
      expect(dockerfile).toContain(`COPY --from=builder /app/scripts/${file}`);
    }
    expect(dockerfile).toMatch(/node scripts\/migrate\.mjs && \(node scripts\/reencrypt\.mjs \|\| true\) && exec node server\.js/);
  });
});
