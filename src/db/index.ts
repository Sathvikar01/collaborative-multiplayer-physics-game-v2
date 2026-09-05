import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

function getPool(): Pool | null {
  if (!databaseUrl) return null;
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({ connectionString: databaseUrl });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

// Lazy: importing this module must never throw (Next evaluates API routes at
// build time). Without DATABASE_URL any query throws at call time, which the
// leaderboard/health routes already catch and degrade gracefully.
function createDb(): NodePgDatabase {
  const pool = getPool();
  if (pool) return drizzle(pool);
  return new Proxy({} as NodePgDatabase, {
    get() {
      throw new Error("DATABASE_URL is required");
    },
  });
}

export const pool = getPool();
export const db: NodePgDatabase = createDb();
