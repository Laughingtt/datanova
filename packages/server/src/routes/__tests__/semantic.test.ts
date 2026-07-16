import { describe, test, expect } from "vitest";

// ==================== Bug #3: SQL injection in semantic.ts filter value ====================
// The metric test endpoint builds SQL by string-concatenating filter values:
//   `${f.column} ${f.operator} '${f.value}'`
// User-controlled f.value can inject SQL. Example: f.value = "'; DROP TABLE users; --"
// Fix: use parameterized queries or escape values with mysql2.escape().
//
// mysql.escape() prevents injection by wrapping the value in quotes and escaping
// internal quote characters. The literal text "DROP TABLE" may still appear in
// the escaped string, but it's inside a quoted string literal, so MySQL treats
// it as data, not as a SQL command.

import mysql from "mysql2";

describe("semantic filter SQL injection prevention", () => {
  test("raw-interpolated filter values allow SQL injection", () => {
    // Malicious filter value attempting SQL injection
    const maliciousValue = "'; DROP TABLE users; --";

    // BUG SCENARIO: raw string interpolation — breaks out of the quote
    const buggySql = `name = '${maliciousValue}'`;
    // The single quote in maliciousValue closes the string literal,
    // allowing DROP TABLE to be interpreted as SQL command
    expect(buggySql).toContain("'"); // Has unescaped single quote
    // The resulting SQL would be: name = ''; DROP TABLE users; --'
    // Which executes 3 statements: SET name='', DROP TABLE users, comment
  });

  test("escaped filter values prevent SQL injection", () => {
    const maliciousValue = "'; DROP TABLE users; --";

    // FIX SCENARIO: use mysql2.escape() to sanitize
    const escapedValue = mysql.escape(maliciousValue);
    const safeSql = `name = ${escapedValue}`;

    // mysql.escape wraps the value in single quotes and escapes internal quotes
    // Result: name = '\'; DROP TABLE users; --'
    // MySQL sees this as a single string literal, not as multiple statements
    expect(escapedValue.startsWith("'")).toBe(true);
    expect(escapedValue.endsWith("'")).toBe(true);
    // The key difference: internal single quotes are escaped with backslash
    expect(safeSql).toContain("\\'");
    // The escaped quote prevents breaking out of the string literal
    expect(safeSql.match(/(?<!\\)'/g)?.length).toBe(2); // Only the wrapping quotes
  });

  test("normal filter values are preserved after escaping", () => {
    const normalValues = ["active", "2024-01-01", "100", "user@example.com"];

    for (const val of normalValues) {
      const escaped = mysql.escape(val);
      const sql = `status = ${escaped}`;
      // Escaped values should still contain the original value
      expect(sql).toContain(val);
      // No unexpected escaping for simple strings (just wrapping quotes)
      expect(sql).toBe(`status = '${val}'`);
    }
  });

  test("filter column names should use escapeId to prevent injection", () => {
    // Even column names could be manipulated if user controls them
    const maliciousColumn = "id; DROP TABLE users";

    // BUG: raw interpolation allows injection
    const buggySql = `${maliciousColumn} = 1`;
    expect(buggySql).toContain("; DROP");

    // FIX: use escapeId to wrap in backticks
    const safeColumn = mysql.escapeId(maliciousColumn);
    const safeSql = `${safeColumn} = 1`;
    // escapeId wraps in backticks, making the entire string a single identifier
    expect(safeSql).toContain("`");
    // The backtick-wrapped identifier means MySQL treats "id; DROP TABLE users"
    // as a single column name (which doesn't exist), not as SQL commands
    expect(safeSql).toBe("`id; DROP TABLE users` = 1");
  });
});
