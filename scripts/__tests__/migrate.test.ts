import { spawnSync } from 'child_process';
import { join } from 'path';
import { splitSqlStatements } from '../sql-tokenizer.mjs';

describe('splitSqlStatements()', () => {
  it('splits simple semicolon-separated statements', () => {
    const sql = 'CREATE TABLE a (id INT); CREATE TABLE b (id INT);';
    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE a (id INT)',
      'CREATE TABLE b (id INT)',
    ]);
  });

  it('does NOT split on semicolons inside dollar-quoted blocks', () => {
    const sql = `
      CREATE FUNCTION foo() RETURNS void AS $$
        BEGIN
          RAISE NOTICE 'hello; world';
        END;
      $$ LANGUAGE plpgsql;
    `;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain('$$');
  });

  it('does NOT split on semicolons inside single-quoted strings', () => {
    const sql = `INSERT INTO t (col) VALUES ('value;with;semis');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("'value;with;semis'");
  });

  it('handles escaped single quotes (repeated quote)', () => {
    const sql = `INSERT INTO t (col) VALUES ('it''s fine; really');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
  });

  it('strips single-line comments', () => {
    const sql = `-- this is a comment\nCREATE TABLE a (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).not.toContain('--');
  });

  it('strips block comments', () => {
    const sql = `/* drop everything */ CREATE TABLE a (id INT);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).not.toContain('/*');
  });

  it('returns empty array for empty input', () => {
    expect(splitSqlStatements('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(splitSqlStatements('   \n\t  ')).toEqual([]);
  });

  it('handles trailing content with no closing semicolon', () => {
    const sql = 'SELECT 1;\nSELECT 2';
    expect(splitSqlStatements(sql)).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('handles $1 parameter placeholders without treating them as dollar-quotes', () => {
    // tagEnd === -1 when no second $ follows immediately after $1
    const sql = `SELECT $1; SELECT $2;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
  });

  it('throws on unclosed block comment', () => {
    const sql = `CREATE TABLE a (id INT); /* unclosed comment`;
    expect(() => splitSqlStatements(sql)).toThrow('Unclosed block comment');
  });

  it('throws on unclosed single-quoted string', () => {
    const sql = `INSERT INTO t VALUES ('unclosed`;
    expect(() => splitSqlStatements(sql)).toThrow('Unclosed single-quoted string');
  });

  it('throws on unclosed dollar-quote tag', () => {
    const sql = `CREATE FUNCTION foo() RETURNS void AS $$ BEGIN -- missing close`;
    expect(() => splitSqlStatements(sql)).toThrow('Unclosed dollar-quote tag');
  });

  it('handles multiple statements with comments between them', () => {
    const sql = `
      CREATE TABLE a (id INT);
      -- a comment between statements
      CREATE TABLE b (id INT);
      /* block comment */ CREATE TABLE c (id INT);
    `;
    expect(splitSqlStatements(sql)).toHaveLength(3);
  });
});

describe('migrate.mjs — DATABASE_URL guard', () => {
  it('exits with code 0 and emits a warning when DATABASE_URL is not set', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;

    const result = spawnSync('node', [join(__dirname, '../migrate.mjs')], {
      env,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('DATABASE_URL is not set');
    expect(result.stderr).toContain('skipping migrations');
  });
});
