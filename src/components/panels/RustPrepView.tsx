import React from 'react';
import { ArrowLeft, Cpu, ShieldCheck, Server } from 'lucide-react';

interface RustPrepViewProps {
  engineName: 'mysql' | 'local-json-fallback';
  onClose: () => void;
}

export const RustPrepView: React.FC<RustPrepViewProps> = ({
  engineName,
  onClose,
}) => {
  const rustCrates = [
    {
      cratePath: 'rust/crates/lms-domain/src/result.rs & types.rs',
      responsibility:
        'Result<T, DomainError>, Newtype IDs (TeacherId, StudentId, AssignmentId), & Enum State Machine',
      parityTarget: 'src/domain/result.ts & src/domain/types.ts',
    },
    {
      cratePath: 'rust/crates/lms-domain/src/rbac.rs',
      responsibility:
        'Guard isolasi teacher_assignments (403), privasi Buku Tulis (BK/Wali/Wakasek/KS metadata-only), & CBT Susulan',
      parityTarget: 'src/domain/rbac.ts',
    },
    {
      cratePath: 'rust/crates/lms-domain/src/attendance.rs',
      responsibility:
        'Evaluasi HADIR vs AKSES_TANPA_AKTIVITAS berbasis aktivitas baca/tugas/refleksi dalam jendela sesi',
      parityTarget: 'src/domain/attendance.ts',
    },
    {
      cratePath: 'rust/crates/lms-domain/src/cbt.rs',
      responsibility:
        'Deteksi bentrok jadwal siswa lintas semua guru/mapel (HTTP 409) & skoring jawaban CBT objektif',
      parityTarget: 'src/domain/cbt.ts',
    },
    {
      cratePath: 'rust/crates/lms-domain/src/grading.rs & prompt_engine.rs',
      responsibility:
        'Kalkulasi bobot nilai K13/Merdeka, e-Rapor dinamis sesuai mapping Admin, & perakit prompt AI bebas PII',
      parityTarget: 'src/domain/grading.ts & promptEngine.ts',
    },
    {
      cratePath: 'rust/crates/lms-server/src/main.rs & db.rs & storage.rs',
      responsibility:
        'HTTP Server Rust (Axum 0.8 + Tokio + SQLx MySQL 8) melayani /api/*, unggah disk STORAGE_DIR, & SPA dist/',
      parityTarget: 'server.ts & mysqlRepository.ts (runtime sandbox Node)',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Arsitektur Backend Rust Workspace (lms-domain + lms-server)
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Seluruh aturan bisnis inti dan HTTP API backend tersedia sebagai Cargo workspace Rust (<code className="font-mono text-slate-800">axum</code> + <code className="font-mono text-slate-800">sqlx</code> MySQL 8) yang siap di-compile pada kontainer Rust Docker.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 rounded-md border border-slate-300 hover:bg-slate-100 text-sm font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Kembali ke Workspace</span>
        </button>
      </div>

      {/* Transparent Runtime Status */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Cpu className="w-4 h-4 text-sky-800" aria-hidden="true" />
            <span>Kode Sumber Rust Workspace</span>
          </div>
          <p className="text-base font-bold text-slate-900 font-mono">
            /rust/crates/lms-domain + lms-server
          </p>
          <p className="text-xs text-slate-600">
            Build image produksi GHCR via <span className="font-mono">docker/docker-compose.prod.yml</span>.
          </p>
        </div>

        <div className="pt-4 md:pt-0 md:pl-6 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Server className="w-4 h-4 text-sky-800" aria-hidden="true" />
            <span>Backend Engine Aktif</span>
          </div>
          <p className="text-base font-bold text-slate-900 font-mono">
            Pure Rust Axum + SQLx ({engineName})
          </p>
          <p className="text-xs text-slate-600">
            Frontend SPA (<span className="font-mono">dist/</span>) memanggil endpoint <span className="font-mono">/api/*</span> dengan otentikasi Bearer token.
          </p>
        </div>

        <div className="pt-4 md:pt-0 md:pl-6 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-700" aria-hidden="true" />
            <span>Deploy Stack Produksi</span>
          </div>
          <p className="text-xs font-mono text-slate-800 bg-slate-50 border border-slate-200 rounded px-2.5 py-2">
            docker compose -f docker/docker-compose.prod.yml --env-file docker/.env up -d
          </p>
        </div>
      </div>

      {/* Workspace Crate Matrix */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
              <th className="py-3 px-4 font-semibold">Crate & Berkas Rust</th>
              <th className="py-3 px-4 font-semibold">Logika Pemrosesan Rust</th>
              <th className="py-3 px-4 font-semibold">Paritas Sandbox TypeScript</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rustCrates.map((item) => (
              <tr key={item.cratePath} className="align-top hover:bg-slate-50/70">
                <td className="py-3.5 px-4 font-mono text-xs font-semibold text-sky-900">
                  {item.cratePath}
                </td>
                <td className="py-3.5 px-4 text-xs text-slate-700 leading-relaxed">
                  {item.responsibility}
                </td>
                <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                  {item.parityTarget}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">
            Pure Rust RBAC Guard (<code className="font-mono text-xs text-sky-900">rust/crates/lms-domain/src/rbac.rs</code>)
          </h2>
          <pre className="p-3.5 rounded-md bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto">
{`pub fn guard_teacher_assignment_ownership<'a>(
    ctx: &AuthContext,
    assignment: Option<&'a TeacherAssignment>,
    action_label: &str,
) -> Result<&'a TeacherAssignment, DomainError> {
    let Some(ta) = assignment else {
        return Err(DomainError::forbidden("Akses ditolak", "GURU_MAPEL:OWN_ASSIGNMENT"));
    };
    match &ctx.teacher {
        Some(t) if t.id == ta.teacher_id => Ok(ta),
        _ => Err(DomainError::forbidden("403 Lintas Guru", "GURU_MAPEL:OWN_ASSIGNMENT")),
    }
}`}
          </pre>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
          <h2 className="text-sm font-bold text-slate-900">
            Axum Handler + SQLx MySQL 8 (<code className="font-mono text-xs text-sky-900">rust/crates/lms-server/src/main.rs</code>)
          </h2>
          <pre className="p-3.5 rounded-md bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto">
{`async fn create_exam_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<CreateExamRequest>,
) -> Result<Json<Value>, ApiError> {
    let ctx = db::resolve_auth_context(&state.pool, &headers).await?;
    validate_exam_no_student_overlap(&candidate, &existing, &ta, &stu, &[], &[])?;
    let mut tx = state.pool.begin().await?;
    sqlx::query("INSERT INTO exams (...) VALUES (...)")
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({ "ok": true })))
}`}
          </pre>
        </div>
      </div>
    </div>
  );
};
