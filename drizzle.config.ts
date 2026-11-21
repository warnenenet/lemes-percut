import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'mysql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'mysql://lms_user:lms_pass@127.0.0.1:3306/lms_smkn1',
  },
  verbose: true,
  strict: true,
});
