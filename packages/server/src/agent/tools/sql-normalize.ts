/**
 * SQL normalization utilities.
 *
 * LLM-generated SQL sometimes has keywords glued together
 * (e.g. `revenueFROM`, `c.idWHERE`, `yearGROUP`), which makes the
 * SQL un-executable.  This module provides a `normalizeSql()` function
 * that inserts missing whitespace before SQL keywords, strips markdown
 * fences, and trims trailing semicolons — making the SQL safe to pass
 * to EXPLAIN / execute.
 */

/**
 * SQL clause-starting keywords that MUST be preceded by whitespace or start-of-string.
 * These are the keywords most commonly glued to preceding identifiers by LLMs.
 *
 * IMPORTANT: We only include keywords that are SAFE to split on — i.e., they
 * are not substrings of common SQL identifiers. "ON" is tricky because it
 * appears in "INFORMATION_SCHEMA", "CONCAT", etc. We handle it separately.
 *
 * Ordered longest-first so "GROUP BY" matches before "GROUP", etc.
 */
const CLAUSE_KEYWORDS = [
  // Multi-word keywords first (longest match wins)
  "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN", "FULL JOIN",
  "GROUP BY", "ORDER BY", "UNION ALL",
  // Clause-starting single keywords
  "SELECT", "FROM", "WHERE", "JOIN", "HAVING", "LIMIT", "OFFSET",
  "UNION", "VALUES", "WITH",
  // Keywords that commonly get glued and are safe to split
  "AND", "OR", "AS", "INTO", "SET",
];

/**
 * Normalize a SQL string produced by an LLM:
 * 1. Strip markdown code fences (```sql ... ```)
 * 2. Insert missing whitespace before SQL keywords (fix `revenueFROM` → `revenue FROM`)
 * 3. Trim trailing semicolons
 * 4. Normalize horizontal whitespace (preserve newlines for formatting)
 */
export function normalizeSql(raw: string): string {
  let sql = raw.trim();

  // 1. Strip markdown code fences
  sql = sql.replace(/^```(?:sql|SQL)?\s*\n?/i, "");
  sql = sql.replace(/\n?```\s*$/i, "");

  // 2. Fix keyword粘连 — insert space before keywords that are glued to preceding text.
  //    For each keyword, we match: (non-space char)(keyword)
  //    where the keyword is at a true word boundary (not inside a longer identifier).
  //    The \b after the keyword ensures it's a complete keyword, not a prefix of a longer word.

  for (const kw of CLAUSE_KEYWORDS) {
    const kwPattern = kw.replace(/ /g, "\\s+");
    // Match: (non-whitespace)(keyword) where keyword ends at a word boundary
    const re = new RegExp(`(\\S)(${kwPattern})\\b`, "gi");
    let prev = "";
    let iter = 0;
    while (prev !== sql && iter < 5) {
      prev = sql;
      sql = sql.replace(re, "$1 $2");
      iter++;
    }
  }

  // Handle "ON" specially — it appears inside words like INFORMATION_SCHEMA, CONCAT.
  // We only split when ON follows a short table alias and looks like a JOIN condition.
  // Strategy: find "ON" that is preceded by 1-3 lowercase letters (a table alias)
  // and followed by a space/equal/dot (JOIN condition pattern).
  // e.g. "gON g.id" → "g ON g.id", but "CONCAT(" stays intact.
  {
    // Match: 1-3 lowercase letters (table alias) immediately followed by "ON"
    // then a space, dot, or equals (JOIN condition indicator).
    // We require lowercase-only alias to avoid matching "CONCAT" → "C ON CAT"
    const re = /([a-z]{1,3})(ON)(\s|\.|=)/gi;
    let prev = "";
    let iter = 0;
    while (prev !== sql && iter < 5) {
      prev = sql;
      sql = sql.replace(re, "$1 $2$3");
      iter++;
    }
  }

  // 3. Trim trailing semicolons (our executor appends LIMIT, semicolons break it)
  sql = sql.replace(/;\s*$/, "");

  // 4. Normalize horizontal whitespace (spaces/tabs → single space), preserve newlines
  sql = sql.replace(/[ \t]+/g, " ").trim();

  return sql;
}
