import { secretStrengthProblems } from '../secret-strength.mjs';

const HEX_64 = 'a'.repeat(64);

describe('secretStrengthProblems()', () => {
  it('accepts 64-character hex secrets', () => {
    expect(
      secretStrengthProblems({ JWT_SECRET: HEX_64, API_TOKEN: HEX_64, ENCRYPTION_KEY: HEX_64 }),
    ).toEqual([]);
  });

  it.each([
    ['nothing set', {}],
    ['empty, as a copied .env.example leaves them', { JWT_SECRET: '', API_TOKEN: '', ENCRYPTION_KEY: '' }],
  ])('accepts unset secrets: %s', (_, env) => {
    expect(secretStrengthProblems(env)).toEqual([]);
  });

  it('accepts a secret of exactly 32 characters', () => {
    expect(secretStrengthProblems({ JWT_SECRET: 'x'.repeat(32) })).toEqual([]);
  });

  it.each(['JWT_SECRET', 'API_TOKEN', 'ENCRYPTION_KEY'])('rejects a short %s by name', (name) => {
    const problems = secretStrengthProblems({ [name]: 'x'.repeat(31) });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(name);
  });
});
