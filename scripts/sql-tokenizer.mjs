/**
 * Split a SQL string into individual statements.
 *
 * Handles:
 *   - Dollar-quoted strings ($tag$...$tag$) — preserved across semicolons
 *   - Single-quoted strings ('...') with escaped quotes ('')
 *   - Single-line comments (--...) — stripped from output
 *   - Block comments (/* ... *\/) — stripped from output
 *
 * Note: PostgreSQL E'...\'' escape strings are NOT handled — Prisma does not emit them.
 *
 * Throws if the SQL contains an unclosed block comment, unclosed single-quoted string,
 * or an unclosed dollar-quote tag (indicating malformed SQL that would silently corrupt
 * or partially apply a migration).
 *
 * @param {string} sql - Raw SQL file contents
 * @returns {string[]} Non-empty, trimmed SQL statements (no trailing semicolon)
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    // Dollar-quote: $tag$ ... $tag$ where tag is empty ($$) or a valid identifier
    if (sql[i] === '$') {
      const tagEnd = sql.indexOf('$', i + 1);
      if (tagEnd !== -1) {
        const tag = sql.slice(i, tagEnd + 1);
        // Only treat as dollar-quote if the tag content is a valid SQL identifier
        // (empty for $$, or letters/digits/underscore only). This prevents $1 parameter
        // placeholders from being mistaken for dollar-quote openers.
        const tagContent = tag.slice(1, -1);
        const isValidTag = tagContent === '' || /^[A-Za-z_][A-Za-z0-9_]*$/.test(tagContent);
        if (isValidTag) {
          const closeIdx = sql.indexOf(tag, tagEnd + 1);
          if (closeIdx !== -1) {
            current += sql.slice(i, closeIdx + tag.length);
            i = closeIdx + tag.length;
            continue;
          }
          throw new Error(`Unclosed dollar-quote tag "${tag}" in SQL starting at position ${i}`);
        }
      }
    }
    // Single-quoted string ('...' with standard SQL '' escaping only).
    // Note: PostgreSQL E'...\'' escape strings are NOT handled — Prisma does not emit them.
    if (sql[i] === "'") {
      const strStart = i;
      current += sql[i++];
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { current += "''"; i += 2; }
        else if (sql[i] === "'") { current += sql[i++]; closed = true; break; }
        else current += sql[i++];
      }
      if (!closed) {
        throw new Error(`Unclosed single-quoted string in SQL starting at position ${strStart}`);
      }
      continue;
    }
    // Single-line comment (strip)
    if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // Block comment (strip)
    if (sql[i] === '/' && sql[i + 1] === '*') {
      const commentStart = i;
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      if (i >= sql.length) {
        throw new Error(`Unclosed block comment in SQL starting at position ${commentStart}`);
      }
      i += 2;
      continue;
    }
    // Statement separator
    if (sql[i] === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) statements.push(stmt);
      current = '';
      i++;
      continue;
    }
    current += sql[i++];
  }
  const stmt = current.trim();
  if (stmt.length > 0) statements.push(stmt);
  return statements;
}
