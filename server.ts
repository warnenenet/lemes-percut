import express from 'express';
import path from 'node:path';
import { createServer as createViteServer, type Plugin } from 'vite';
import { DomainError } from './src/domain/result';
import { UserRole } from './src/domain/types';
import { isMysqlConfigured, pingMysql } from './src/db/index';
import {
  ensureStorageDirectories,
  getStorageRoot,
  resolveStoredFilePath,
  saveUploadedFile,
} from './src/db/storage';
import { buildHealthResponse, evaluatePersistencePolicy } from './src/db/envGuard';
import {
  createLmsRepository,
  JsonFallbackRepository,
  LmsRepository,
} from './src/db/repositories/index';
import { RepoResult } from './src/db/repositories/types';

const policy = evaluatePersistencePolicy(process.env);
if (!policy.allowed) {
  console.error(policy.reason);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
const APP_MODE = process.env.APP_MODE === 'CBT' ? 'CBT' : 'LMS';

ensureStorageDirectories();
let repo: LmsRepository = createLmsRepository(policy);

function sendDomainError(res: express.Response, error: DomainError) {
  return res.status(error.httpStatus).json({ ok: false, error });
}

function sendRepoError(res: express.Response, result: Extract<RepoResult<unknown>, { ok: false }>) {
  return sendDomainError(res, result.error);
}

function extractAuthHeader(req: express.Request): {
  userId?: string;
  requestedRole?: UserRole;
} {
  return {
    userId:
      (req.header('x-user-id') as string | undefined) ||
      (req.query.userId as string | undefined),
    requestedRole:
      (req.header('x-active-role') as UserRole | undefined) ||
      (req.query.role as UserRole | undefined),
  };
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function asyncHandler(
  fn: (req: express.Request, res: express.Response) => Promise<unknown>,
): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

async function startServer() {
  if (
    repo.engineName === 'mysql' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_JSON_FALLBACK === 'true'
  ) {
    const reachable = await pingMysql();
    if (!reachable) {
      console.warn(
        '[dev-sandbox] MySQL tidak terjangkau; memakai JsonFallbackRepository (ALLOW_JSON_FALLBACK=true, NODE_ENV!=production).',
      );
      repo = new JsonFallbackRepository();
    }
  }

  const app = express();
  app.use(express.json({ limit: '8mb' }));

  // Auth: Email / NISN / NUPTK + Password
  app.post(
    '/api/auth/login',
    asyncHandler(async (req, res) => {
      const identifier = String(req.body?.identifier ?? '').trim();
      const password = String(req.body?.password ?? '');
      const ip = req.ip ?? 'local';

      const rate = loginAttempts.get(ip);
      const now = Date.now();
      if (rate && now < rate.resetAt && rate.count >= 20) {
        return res.status(429).json({
          ok: false,
          error: {
            kind: 'FORBIDDEN',
            httpStatus: 429,
            message: 'Terlalu banyak percobaan login. Tunggu 1 menit.',
          },
        });
      }

      const authRes = await repo.authenticateUser(identifier, password);
      if (!authRes.ok) {
        loginAttempts.set(ip, {
          count: (rate?.count ?? 0) + 1,
          resetAt: rate && now < rate.resetAt ? rate.resetAt : now + 60_000,
        });
        return sendRepoError(res, authRes);
      }

      return res.json({ ok: true, user: authRes.value });
    }),
  );

  // Health endpoint for Docker healthchecks & persistence verification
  app.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const usingMysqlRepo = repo.engineName === 'mysql';
      const mysqlReachable = usingMysqlRepo ? await pingMysql() : false;
      let counts = {
        majors: 0,
        rombels: 0,
        students: 0,
        teachers: 0,
        bk_counselors: 0,
        pkl_placements: 0,
      };
      try {
        counts = await repo.getHealthCounts();
      } catch {
        // Return zeroed counts if DB temporarily unreachable
      }

      const health = buildHealthResponse({
        nodeEnv: process.env.NODE_ENV,
        appMode: APP_MODE,
        mysqlConfigured: usingMysqlRepo && isMysqlConfigured(),
        mysqlReachable,
        storageDir: getStorageRoot(),
        counts,
      });
      return res.status(health.httpStatus).json(health.body);
    }),
  );

  // Public school profile for login page
  app.get(
    '/api/public/bootstrap',
    asyncHandler(async (_req, res) => {
      const data = await repo.getBootstrapData(APP_MODE);
      return res.json(data);
    }),
  );

  // Real File Storage: Upload & Serve (STORAGE_DIR)
  app.post(
    '/api/files/upload',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) {
        return res.status(401).json({
          ok: false,
          error: { httpStatus: 401, message: 'Autentikasi diperlukan untuk unggah berkas.' },
        });
      }

      const { category, originalName, mimeType, base64Data } = req.body ?? {};
      const saved = saveUploadedFile({
        category: String(category ?? ''),
        originalName: String(originalName ?? ''),
        mimeType: String(mimeType ?? 'application/octet-stream'),
        base64Data: String(base64Data ?? ''),
      });
      if (!saved.ok) {
        return res.status(saved.error.httpStatus).json({
          ok: false,
          error: saved.error,
        });
      }
      return res.json({ ok: true, file: saved.value });
    }),
  );

  app.get('/api/files/:category/:filename', (req, res) => {
    const filePath = resolveStoredFilePath(
      req.params.category,
      req.params.filename,
    );
    if (!filePath) {
      return res.status(404).json({
        ok: false,
        error: { httpStatus: 404, message: 'Berkas tidak ditemukan.' },
      });
    }
    return res.sendFile(filePath);
  });

  // Role-filtered state snapshot (enforces notebook content privacy at API boundary!)
  app.get(
    '/api/state',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) {
        return res.status(401).json({
          ok: false,
          error: { message: 'Autentikasi diperlukan.' },
        });
      }
      const payload = await repo.getWorkspaceState(ctx);
      return res.json({ ok: true, ...payload });
    }),
  );

  // Direct notebook content endpoint (returns explicit 403 for BK/Wali/Wakasek/Kepsek)
  app.get(
    '/api/notebooks/:id/entries',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.getNotebookEntries(ctx, req.params.id);
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, entries: result.value });
    }),
  );

  app.post(
    '/api/notebooks/:subjectId/entries',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createNotebookEntry(ctx, req.params.subjectId, {
        judul: String(req.body?.judul ?? ''),
        konten: String(req.body?.konten ?? ''),
        gambar_url: req.body?.gambar_url ?? null,
      });
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, entry: result.value });
    }),
  );

  app.post(
    '/api/notebook-entries/:id/comment',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.commentNotebookEntry(
        ctx,
        req.params.id,
        String(req.body?.komentar ?? ''),
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, entry: result.value });
    }),
  );

  // Sessions & Activity-Based Attendance
  app.post(
    '/api/sessions',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createSession(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, session: result.value });
    }),
  );

  app.post(
    '/api/sessions/:id/status',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.updateSessionStatus(
        ctx,
        req.params.id,
        req.body?.status,
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true });
    }),
  );

  app.post(
    '/api/sessions/:id/access',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.recordSessionAccess(ctx, req.params.id, {
        readPct: Number(req.body?.readPct ?? 0),
        submittedTask: Boolean(req.body?.submittedTask),
        submittedReflection: Boolean(req.body?.submittedReflection),
        simulatedTimeHHmm: req.body?.simulatedTimeHHmm,
      });
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, record: result.value });
    }),
  );

  app.post(
    '/api/sessions/:id/override',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.overrideSessionAttendance(
        ctx,
        req.params.id,
        req.body ?? {},
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, record: result.value });
    }),
  );

  // Modules & Clone
  app.post(
    '/api/modules',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createModule(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, module: result.value });
    }),
  );

  app.post(
    '/api/modules/:id/clone',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.cloneModule(
        ctx,
        req.params.id,
        String(req.body?.target_assignment_id ?? ''),
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, module: result.value });
    }),
  );

  // Tasks, Submissions, Grading
  app.post(
    '/api/tasks',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createTask(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, task: result.value });
    }),
  );

  app.post(
    '/api/tasks/:id/submit',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.submitTask(ctx, req.params.id, {
        teks: String(req.body?.teks ?? ''),
        file_url: req.body?.file_url ?? null,
      });
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, submission: result.value });
    }),
  );

  app.post(
    '/api/submissions/:id/grade',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.gradeSubmission(ctx, req.params.id, {
        nilai: Number(req.body?.nilai),
        catatan_guru: req.body?.catatan_guru,
      });
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, submission: result.value });
    }),
  );

  app.post(
    '/api/grades',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.upsertGrade(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, record: result.value });
    }),
  );

  app.post(
    '/api/erapor/export',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.exportErapor(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, export: result.value });
    }),
  );

  // CBT API (REST + Token + Overlap Validation + Susulan RBAC)
  app.post(
    '/api/cbt/exams',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createExam(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, exam: result.value });
    }),
  );

  app.post(
    '/api/cbt/exams/:id/start',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.startExamSession(
        ctx,
        req.params.id,
        String(req.body?.token ?? ''),
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, exam_session: result.value });
    }),
  );

  app.post(
    '/api/cbt/sessions/:id/answer',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.saveExamAnswer(ctx, req.params.id, {
        question_id: String(req.body?.question_id ?? ''),
        jawaban: String(req.body?.jawaban ?? ''),
      });
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, answer: result.value });
    }),
  );

  app.post(
    '/api/cbt/sessions/:id/finish',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.finishExamSession(ctx, req.params.id);
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, ...result.value });
    }),
  );

  // Perangkat Ajar: Prompt Generator + Checklist Publish
  app.post(
    '/api/perangkat-ajar/generate',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.generatePrompt(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, prompt: result.value });
    }),
  );

  app.post(
    '/api/perangkat-ajar/save',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.saveTeacherDocument(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, document: result.value });
    }),
  );

  app.post(
    '/api/perangkat-ajar/:id/publish',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.publishTeacherDocument(
        ctx,
        req.params.id,
        req.body?.checklist_state,
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, document: result.value });
    }),
  );

  // PKL Endpoints
  app.post(
    '/api/pkl/journals',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createPklJournal(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, journal: result.value });
    }),
  );

  app.post(
    '/api/pkl/journals/:id/validate',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.validatePklJournal(
        ctx,
        req.params.id,
        req.body ?? {},
      );
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, journal: result.value });
    }),
  );

  app.post(
    '/api/pkl/scores',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.upsertPklScore(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, score: result.value });
    }),
  );

  // Notifications & Coaching & Wali Kelas Notes
  app.post(
    '/api/notifications/send',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.sendNotification(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, notification: result.value });
    }),
  );

  app.post(
    '/api/coaching-notes',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.createCoachingNote(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, note: result.value });
    }),
  );

  app.post(
    '/api/walikelas/notes',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.upsertWalikelasNote(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true });
    }),
  );

  // Admin: Import Preview & Commit, e-Rapor Mapping, Backup
  app.post(
    '/api/admin/import/preview',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.previewImport(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, preview: result.value });
    }),
  );

  app.post(
    '/api/admin/import/commit',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.commitStudentImport(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, ...result.value });
    }),
  );

  app.post(
    '/api/admin/erapor-mapping',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.updateEraporMapping(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, mapping: result.value });
    }),
  );

  app.post(
    '/api/admin/backup',
    asyncHandler(async (req, res) => {
      const { userId, requestedRole } = extractAuthHeader(req);
      const ctx = await repo.resolveAuthContext(userId, requestedRole);
      if (!ctx) return res.status(401).json({ ok: false });
      const result = await repo.recordBackupRun(ctx, req.body ?? {});
      if (!result.ok) return sendRepoError(res, result);
      return res.json({ ok: true, backup: result.value });
    }),
  );

  // Demo reset endpoint: strictly blocked in production or MySQL mode
  app.post(
    '/api/reset-demo',
    asyncHandler(async (_req, res) => {
      if (process.env.NODE_ENV === 'production' || repo.engineName === 'mysql') {
        return res.status(403).json({
          ok: false,
          error: {
            httpStatus: 403,
            message: 'Reset data uji dinonaktifkan pada mode produksi / MySQL.',
          },
        });
      }
      await repo.resetDemoState();
      return res.json({ ok: true });
    }),
  );

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('[server error]', err);
      return res.status(500).json({
        ok: false,
        error: {
          httpStatus: 500,
          message: 'Terjadi kesalahan internal server LMS.',
        },
      });
    },
  );

  // Vite middleware in development, static serve in production
  if (process.env.NODE_ENV !== 'production') {
    process.env.DISABLE_HMR ??= 'true';
    const disableHmrWsPlugin: Plugin = {
      name: 'disable-vite-hmr-client-ws',
      enforce: 'post',
      transform(code, id) {
        if (
          id.includes('vite/dist/client/client.mjs') ||
          id.includes('vite\\dist\\client\\client.mjs')
        ) {
          const patched = code.replace(
            /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\}\)\(\)\);/,
            `const transport = normalizeModuleRunnerTransport({
  async connect() {},
  async disconnect() {},
  async send() {},
});`,
          );
          if (patched !== code) {
            return { code: patched, map: null };
          }
        }
        return undefined;
      },
    };
    const vite = await createViteServer({
      plugins: [disableHmrWsPlugin],
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `LMS SMKN 1 Percut Sei Tuan (${APP_MODE}, engine=${repo.engineName}) running on http://localhost:${PORT}`,
    );
  });
}

startServer();
