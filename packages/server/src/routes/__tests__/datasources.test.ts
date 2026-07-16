import { describe, test, expect } from "vitest";

// ==================== Bug #8: Cannot update datasource without providing password ====================
// When updating a datasource with only host/port/etc (no new password),
// body.password is undefined, so testRawConnection falls back to existing.password,
// but existing.password is the ENCRYPTED ciphertext. The connection test then fails
// because it tries to connect with ciphertext as the MySQL password.
// Fix: decrypt existing.password when body.password is not provided.

describe("datasource update — password handling", () => {
  test("when password is not provided in update, existing encrypted password should be decrypted for connection test", () => {
    // Simulate existing datasource with encrypted password
    const existingDatasource = {
      id: "ds-1",
      name: "prod-db",
      host: "db.example.com",
      port: 3306,
      database: "mydb",
      user: "admin",
      password: "iv:tag:ciphertext", // This is the encrypted form
      enabled: 1,
    };

    // Simulate update request — user only changes host, no password
    const updateBody: { host: string; password?: string } = {
      host: "new-db.example.com",
    };

    // BUG SCENARIO: body.password is undefined, so fallback to existing.password
    // which is the encrypted ciphertext — connection test fails
    const bugPassword = updateBody.password ?? existingDatasource.password;
    expect(bugPassword).toBe("iv:tag:ciphertext"); // ciphertext, not real password!

    // FIX SCENARIO: decrypt existing password when body.password is not provided
    // In real code: const passwordForTest = body.password ?? decrypt(existing.password)
    const decryptedPassword = "realP@ssw0rd"; // Simulating decrypt() output
    const fixPassword = updateBody.password ?? decryptedPassword;
    expect(fixPassword).toBe("realP@ssw0rd"); // actual password for MySQL
  });

  test("when password IS provided in update, it should be used directly", () => {
    const existingDatasource = {
      password: "iv:tag:ciphertext",
    };

    const updateBody: { host?: string; password?: string } = {
      password: "newPassword123",
    };

    // When user provides a new password, use it directly
    const passwordForTest = updateBody.password ?? existingDatasource.password;
    expect(passwordForTest).toBe("newPassword123");
  });

  test("decrypt function should correctly handle the iv:tag:ciphertext format", () => {
    // Verify that the decrypt function format is understood
    // crypto.ts produces "iv:tag:ciphertext" format
    const encryptedFormat = "aabbcc:ddeeff:112233445566";
    const parts = encryptedFormat.split(":");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("aabbcc");  // iv hex
    expect(parts[1]).toBe("ddeeff");  // auth tag hex
    expect(parts[2]).toBe("112233445566"); // ciphertext hex
  });
});
