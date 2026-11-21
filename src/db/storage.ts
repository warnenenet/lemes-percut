import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type StorageCategory = 'modules' | 'notebooks' | 'submissions';

const ALLOWED_CATEGORIES = new Set<StorageCategory>([
  'modules',
  'notebooks',
  'submissions',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.pdf',
  '.txt',
  '.md',
  '.doc',
  '.docx',
]);

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const DEFAULT_STORAGE = path.resolve(process.cwd(), 'storage');
const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), 'backups');

export function getStorageRoot(): string {
  const configured = process.env.STORAGE_DIR?.trim();
  return configured ? path.resolve(configured) : DEFAULT_STORAGE;
}

export function getBackupRoot(): string {
  const configured = process.env.BACKUP_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (fs.existsSync('/backup/db')) return '/backup/db';
  return DEFAULT_BACKUP_DIR;
}

export function ensureStorageDirectories(): {
  root: string;
  subdirectories: string[];
} {
  const root = getStorageRoot();
  const subdirs: StorageCategory[] = ['modules', 'notebooks', 'submissions'];
  const created: string[] = [];

  for (const sub of subdirs) {
    const dirPath = path.join(root, sub);
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      created.push(dirPath);
    } catch {
      // Ignore in read-only environments
    }
  }

  return { root, subdirectories: created };
}

export interface SaveUploadInput {
  category: string;
  originalName: string;
  mimeType: string;
  base64Data: string;
}

export interface SavedUploadResult {
  category: StorageCategory;
  filename: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export type StorageError =
  | { httpStatus: 400 | 413 | 422; message: string };

export function saveUploadedFile(
  input: SaveUploadInput,
): { ok: true; value: SavedUploadResult } | { ok: false; error: StorageError } {
  if (!ALLOWED_CATEGORIES.has(input.category as StorageCategory)) {
    return {
      ok: false,
      error: {
        httpStatus: 422,
        message: 'Kategori penyimpanan tidak valid (gunakan modules, notebooks, atau submissions).',
      },
    };
  }
  const category = input.category as StorageCategory;

  const baseName = path.basename(String(input.originalName || 'file'));
  const ext = path.extname(baseName).toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: {
        httpStatus: 422,
        message: `Ekstensi berkas tidak diizinkan (${ext || 'tanpa ekstensi'}). Diizinkan: png, jpg, jpeg, webp, pdf, txt, md, doc, docx.`,
      },
    };
  }

  const rawBase64 = String(input.base64Data || '').includes(',')
    ? String(input.base64Data).split(',')[1] ?? ''
    : String(input.base64Data || '');

  if (!rawBase64.trim()) {
    return {
      ok: false,
      error: { httpStatus: 422, message: 'Konten berkas kosong.' },
    };
  }

  const buffer = Buffer.from(rawBase64, 'base64');
  if (buffer.length === 0) {
    return {
      ok: false,
      error: { httpStatus: 422, message: 'Data base64 berkas tidak valid.' },
    };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: {
        httpStatus: 413,
        message: 'Ukuran berkas melebihi batas maksimum 5 MB.',
      },
    };
  }

  const stem = baseName
    .slice(0, baseName.length - ext.length)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'berkas';

  const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const safeFilename = `${stem}-${uniqueSuffix}${ext}`;

  ensureStorageDirectories();
  const categoryDir = path.resolve(getStorageRoot(), category);
  const fullPath = path.resolve(categoryDir, safeFilename);

  if (!fullPath.startsWith(categoryDir + path.sep)) {
    return {
      ok: false,
      error: { httpStatus: 400, message: 'Path berkas tidak valid.' },
    };
  }

  fs.writeFileSync(fullPath, buffer);

  return {
    ok: true,
    value: {
      category,
      filename: safeFilename,
      url: `/api/files/${category}/${safeFilename}`,
      sizeBytes: buffer.length,
      mimeType: String(input.mimeType || 'application/octet-stream'),
    },
  };
}

export function resolveStoredFilePath(
  category: string,
  filename: string,
): string | null {
  if (!ALLOWED_CATEGORIES.has(category as StorageCategory)) {
    return null;
  }
  if (
    !filename ||
    filename.includes('\0') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename.includes('..')
  ) {
    return null;
  }

  const categoryDir = path.resolve(getStorageRoot(), category);
  const candidate = path.resolve(categoryDir, filename);
  if (!candidate.startsWith(categoryDir + path.sep)) {
    return null;
  }
  if (!fs.existsSync(candidate)) {
    return null;
  }
  return candidate;
}

export interface BackupFileRecord {
  readonly id: string;
  readonly filename: string;
  readonly size_bytes: number;
  readonly status: 'OK' | 'EMPTY_ALERT';
  readonly created_at: string;
}

export function listDiskBackupFiles(backupDir = getBackupRoot()): BackupFileRecord[] {
  try {
    if (!fs.existsSync(backupDir)) return [];
    const entries = fs.readdirSync(backupDir);
    const records: BackupFileRecord[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.sql.gz') && !entry.endsWith('.sql')) continue;
      const fullPath = path.join(backupDir, entry);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      records.push({
        id: `disk-${entry}`,
        filename: entry,
        size_bytes: stat.size,
        status: stat.size === 0 ? 'EMPTY_ALERT' : 'OK',
        created_at: stat.mtime.toISOString(),
      });
    }
    return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } catch {
    return [];
  }
}
