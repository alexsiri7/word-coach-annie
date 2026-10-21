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

});
