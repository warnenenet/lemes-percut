export interface PersistenceEnvInput {
  DATABASE_URL?: string;
  ALLOW_JSON_FALLBACK?: string;
  NODE_ENV?: string;
}

export interface PersistencePolicyResult {
  allowed: boolean;
  mode: 'mysql' | 'local-json-fallback';
  allowJsonFallback: boolean;
  reason?: string;
}

export function evaluatePersistencePolicy(
  env: PersistenceEnvInput,
): PersistencePolicyResult {
  const hasDatabaseUrl = Boolean(
    env.DATABASE_URL && env.DATABASE_URL.trim().length > 0,
  );
  const allowFallback =
    env.ALLOW_JSON_FALLBACK === 'true' && env.NODE_ENV !== 'production';

  if (hasDatabaseUrl) {
    return {
      allowed: true,
      mode: 'mysql',
      allowJsonFallback: allowFallback,
    };
  }

  if (!allowFallback) {
    return {
      allowed: false,
      mode: 'local-json-fallback',
      allowJsonFallback: false,
      reason:
        'FATAL: DATABASE_URL tidak diset dan fallback JSON dilarang (NODE_ENV=production atau ALLOW_JSON_FALLBACK!=true). Refusing to start.',
    };
  }

  return {
    allowed: true,
    mode: 'local-json-fallback',
    allowJsonFallback: true,
  };
}

export interface HealthPayloadInput {
  nodeEnv?: string;
  appMode: 'LMS' | 'CBT';
  mysqlConfigured: boolean;
  mysqlReachable: boolean;
  storageDir: string;
  counts: {
    majors: number;
    rombels: number;
    students: number;
    teachers: number;
    bk_counselors: number;
    pkl_placements: number;
  };
}

export function buildHealthResponse(input: HealthPayloadInput) {
  const isProduction = input.nodeEnv === 'production';
  const engine: 'mysql' | 'mysql-unreachable' | 'local-json-fallback' =
    input.mysqlConfigured
      ? input.mysqlReachable
        ? 'mysql'
        : 'mysql-unreachable'
      : 'local-json-fallback';

  const status: 'OK' | 'DEGRADED' = engine === 'mysql' ? 'OK' : 'DEGRADED';
  const httpStatus = isProduction && engine !== 'mysql' ? 503 : 200;

  return {
    httpStatus,
    body: {
      ok: httpStatus === 200,
      status,
      engine,
      app_mode: input.appMode,
      mysql_configured: input.mysqlConfigured,
      mysql_reachable: input.mysqlReachable,
      storage_dir: input.storageDir,
      persistence: {
        engine,
        mysql_configured: input.mysqlConfigured,
        mysql_reachable: input.mysqlReachable,
        storage_dir: input.storageDir,
      },
      counts: input.counts,
    },
  };
}
