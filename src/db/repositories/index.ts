import { getMysqlDb } from '../index';
import { PersistencePolicyResult } from '../envGuard';
import { LmsRepository } from './types';
import { JsonFallbackRepository } from './jsonRepository';
import { MysqlDrizzleRepository } from './mysqlRepository';

export function createLmsRepository(policy: PersistencePolicyResult): LmsRepository {
  if (policy.mode === 'mysql') {
    const db = getMysqlDb();
    if (!db) {
      throw new Error('FATAL: Policy mode=mysql tetapi getMysqlDb() mengembalikan null.');
    }
    return new MysqlDrizzleRepository(db);
  }
  return new JsonFallbackRepository();
}

export type { LmsRepository, BootstrapPayload, WorkspaceStatePayload } from './types';
export { JsonFallbackRepository } from './jsonRepository';
export { MysqlDrizzleRepository } from './mysqlRepository';
