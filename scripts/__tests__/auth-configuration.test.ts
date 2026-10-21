import { isAuthEnabled } from '@/lib/auth';
import { authConfigurationProblems } from '../auth-configuration.mjs';

describe('authConfigurationProblems()', () => {
  it.each([
    ['API_TOKEN', { API_TOKEN: 'tok' }],
    ['GOOGLE_CLIENT_ID', { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }],
    ['both', { API_TOKEN: 'tok', GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }],
  ])('accepts %s', (_, env) => {
    expect(authConfigurationProblems(env)).toEqual([]);
  });

  it.each([
    ['nothing set', {}],
    ['both empty, as a copied .env.example leaves them', { API_TOKEN: '', GOOGLE_CLIENT_ID: '' }],
  ])('rejects %s', (_, env) => {
    expect(authConfigurationProblems(env)).toHaveLength(1);
  });

  // The startup gate must accept exactly the configurations the request-time
  // check treats as authenticated, or production can boot as an open server.
  describe('agrees with isAuthEnabled()', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      ['nothing set', {}],
      ['both empty', { API_TOKEN: '', GOOGLE_CLIENT_ID: '' }],
      ['API_TOKEN', { API_TOKEN: 'tok' }],
      ['GOOGLE_CLIENT_ID', { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }],
      ['both', { API_TOKEN: 'tok', GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' }],
    ])('%s', (_, env: Record<string, string>) => {
      vi.stubEnv('API_TOKEN', env.API_TOKEN);
      vi.stubEnv('GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID);
      expect(authConfigurationProblems(process.env).length === 0).toBe(isAuthEnabled());
    });
  });
});
