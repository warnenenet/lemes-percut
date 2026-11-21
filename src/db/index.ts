import mysql from 'mysql2/promise';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from './schema/index';

export type LmsDb = MySql2Database<typeof schema>;

let cachedPool: mysql.Pool | null = null;
let cachedDb: LmsDb | null = null;

export function isMysqlConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function getMysqlDb(): LmsDb | null {
  if (!isMysqlConfigured()) return null;
  if (!cachedPool) {
    cachedPool = mysql.createPool({
      uri: process.env.DATABASE_URL!,
      charset: 'utf8mb4',
      timezone: '+07:00',
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      connectTimeout: 2000,
    });
    cachedDb = drizzle(cachedPool, { schema, mode: 'default' });
  }
  return cachedDb;
}

export async function pingMysql(): Promise<boolean> {
  if (!isMysqlConfigured()) return false;
  try {
    getMysqlDb();
    if (!cachedPool) return false;
    await cachedPool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
