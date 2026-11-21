import { LmsDatabaseState, NotebookMetadataSummary, User, UserRole } from '../domain/types';
import { AuthContext } from '../domain/rbac';

export interface ClientStatePayload {
  auth: AuthContext;
  state: LmsDatabaseState & {
    notebook_metadata: NotebookMetadataSummary[];
  };
}

export interface ApiErrorShape {
  kind?: string;
  httpStatus?: number;
  message: string;
  conflicts?: ReadonlyArray<{
    studentId: string;
    studentName: string;
    rombelName: string;
    conflictingExamTitle: string;
    overlapStart: string;
    overlapEnd: string;
  }>;
}

export interface BootstrapResponse {
  school: LmsDatabaseState['school'];
  academic_year: LmsDatabaseState['academic_years'][number];
  app_mode: 'LMS' | 'CBT';
  engine: 'mysql' | 'local-json-fallback';
  allow_demo_reset: boolean;
  total_accounts: number;
  demo_users: Array<Pick<User, 'id' | 'nama' | 'email' | 'roles'>>;
}

export interface UploadedFileResponse {
  category: 'modules' | 'notebooks' | 'submissions';
  filename: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
}

export async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    userId?: string;
    activeRole?: UserRole;
  } = {},
): Promise<{ ok: true; data: T } | { ok: false; error: ApiErrorShape }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.userId) headers['x-user-id'] = options.userId;
  if (options.activeRole) headers['x-active-role'] = options.activeRole;

  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = await res.json();
    if (!res.ok || json.ok === false) {
      return {
        ok: false,
        error: json.error ?? { httpStatus: res.status, message: 'Permintaan gagal diproses.' },
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      error: { httpStatus: 0, message: 'Tidak dapat terhubung ke server LMS lokal.' },
    };
  }
}

export async function fetchBootstrap() {
  return apiRequest<BootstrapResponse>('/api/public/bootstrap');
}

export async function loginWithCredentials(identifier: string, password: string) {
  return apiRequest<{ ok: true; user: User }>('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  });
}

export async function fetchWorkspaceState(userId: string, activeRole: UserRole) {
  return apiRequest<ClientStatePayload>('/api/state', {
    userId,
    activeRole,
  });
}

export async function uploadLmsFile(params: {
  category: 'modules' | 'notebooks' | 'submissions';
  originalName: string;
  mimeType: string;
  base64Data: string;
  userId: string;
  activeRole: UserRole;
}) {
  return apiRequest<{ ok: true; file: UploadedFileResponse }>('/api/files/upload', {
    method: 'POST',
    userId: params.userId,
    activeRole: params.activeRole,
    body: {
      category: params.category,
      originalName: params.originalName,
      mimeType: params.mimeType,
      base64Data: params.base64Data,
    },
  });
}
