/**
 * database.ts — Mock database client for demo purposes
 */
export const db = {
  query: async (sql: string, params?: unknown[]) => {
    console.log("Mock query:", sql, params);
    return { rows: [] };
  },
};
