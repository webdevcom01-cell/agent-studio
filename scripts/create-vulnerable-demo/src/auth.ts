/**
 * auth.ts — INTENTIONALLY VULNERABLE (for DevOps Swarm demo)
 * Vulnerability: SQL Injection via string interpolation
 * CWE-89: Improper Neutralization of Special Elements used in an SQL Command
 */
import { db } from "./database";

export async function getUserById(userId: string) {
  // ❌ VULNERABLE: Direct string interpolation allows SQL injection
  // e.g. userId = "1 OR 1=1 --" returns all users
  const result = await db.query(
    `SELECT id, email, role FROM users WHERE id = ${userId}`
  );
  return result.rows[0] ?? null;
}

export async function loginUser(email: string, password: string) {
  // ❌ VULNERABLE: SQL injection via email parameter
  const result = await db.query(
    `SELECT * FROM users WHERE email = '${email}' AND password = '${password}'`
  );
  return result.rows.length > 0;
}

export async function searchUsers(query: string) {
  // ❌ VULNERABLE: SQL injection in LIKE clause
  const result = await db.query(
    `SELECT id, email FROM users WHERE email LIKE '%${query}%'`
  );
  return result.rows;
}
