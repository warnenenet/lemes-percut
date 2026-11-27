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

const TOKEN_KEY = 'lms_smkn1_auth_token';
const USER_KEY = 'lms_smkn1_auth_user';
const ROLE_KEY = 'lms_smkn1_active_role';

let memoryToken: string | null = null;

function readStorage(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage quota / privacy mode restrictions
  }
}

export function getAuthToken(): string | null {
  if (memoryToken) return memoryToken;
  const stored = readStorage(TOKEN_KEY);
  if (stored) memoryToken = stored;
  return stored;
}

export function setAuthSession(
  token: string | null,
  user?: User | null,
  activeRole?: UserRole | null,
) {
  memoryToken = token;
  writeStorage(TOKEN_KEY, token);
  if (user !== undefined) {
    writeStorage(USER_KEY, user ? JSON.stringify(user) : null);
  }
  if (activeRole !== undefined) {
    writeStorage(ROLE_KEY, activeRole);
  }
}

export function setStoredActiveRole(role: UserRole) {
  writeStorage(ROLE_KEY, role);
}

export function getStoredAuthSession(): {
  token: string | null;
  user: User | null;
  activeRole: UserRole | null;
} {
  const token = getAuthToken();
  const userRaw = readStorage(USER_KEY);
  const roleRaw = readStorage(ROLE_KEY) as UserRole | null;
  let user: User | null = null;
  if (userRaw) {
    try {
      user = JSON.parse(userRaw) as User;
    } catch {
      user = null;
    }
  }
  return { token, user, activeRole: roleRaw };
}

export function clearAuthSession() {
  memoryToken = null;
  writeStorage(TOKEN_KEY, null);
  writeStorage(USER_KEY, null);
  writeStorage(ROLE_KEY, null);
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
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (options.userId) {
    headers['x-user-id'] = options.userId;
  }
  if (options.activeRole) {
    headers['x-active-role'] = options.activeRole;
  }

  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const rawText = await res.text();
    let json: Record<string, unknown> = {};
    if (rawText) {
      try {
        json = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        json = {
          ok: false,
          error: {
            httpStatus: res.status,
            message: res.ok
              ? 'Respons server tidak berbentuk JSON valid.'
              : `HTTP ${res.status}: ${rawText.slice(0, 140)}`,
          },
        };
      }
    }

    if (res.status === 401 && !url.includes('/api/auth/login')) {
      clearAuthSession();
    }

    if (!res.ok || json.ok === false) {
      const errObj = json.error as ApiErrorShape | undefined;
      return {
        ok: false,
        error: errObj ?? { httpStatus: res.status, message: 'Permintaan gagal diproses.' },
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      error: { httpStatus: 0, message: 'Tidak dapat terhubung ke server LMS.' },
    };
  }
}

export async function fetchBootstrap() {
  return apiRequest<BootstrapResponse>('/api/public/bootstrap');
}

export async function loginWithCredentials(identifier: string, password: string) {
  const res = await apiRequest<{ ok: true; token?: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: { identifier, password },
  });
  if (res.ok) {
    setAuthSession(
      res.data.token ?? null,
      res.data.user,
      res.data.user.roles[0] ?? null,
    );
  }
  return res;
}

export async function logoutSession() {
  if (getAuthToken()) {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  }
  clearAuthSession();
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
