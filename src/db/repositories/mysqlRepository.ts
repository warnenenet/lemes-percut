import { and, desc, eq, sql } from 'drizzle-orm';
import { LmsDb } from '../index';
import * as schema from '../schema/index';
import { listDiskBackupFiles } from '../storage';
import {
  applyTeacherAttendanceOverride,
  evaluateSessionAccess,
} from '../../domain/attendance';
import {
  gradeStudentExamAnswers,
  validateExamNoStudentOverlap,
  verifyExamToken,
} from '../../domain/cbt';
import { generateEraporExport } from '../../domain/grading';
import {
  previewStudentImportCsv,
  previewTeacherImportCsv,
} from '../../domain/importValidator';
import {
  applyTeacherDocumentContentEdit,
  assemblePromptForTeacher,
  canPublishTeacherDocument,
} from '../../domain/promptEngine';
import {
  AuthContext,
  canCloneBetweenAssignments,
  guardAdminOnly,
  guardBkRombelAccess,
  guardGradeMutation,
  guardNotebookContentRead,
  guardSusulanExamCreation,
  guardTeacherAssignmentOwnership,
  summarizeNotebookMetadata,
} from '../../domain/rbac';
import {
  AttendanceStatus,
  EraporColumnMapping,
  ExamType,
  LmsDatabaseState,
  NotebookMetadataSummary,
  PklScoreComponent,
  SessionType,
  User,
  UserRole,
} from '../../domain/types';
import { CURATED_DEMO_EMAILS } from './jsonRepository';
import {
  BootstrapPayload,
  HealthCounts,
  LmsRepository,
  WorkspaceStatePayload,
} from './types';

function toIsoDateOnly(val: Date | string): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function toIsoString(val: Date | string | null | undefined): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function parseIntId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export class MysqlDrizzleRepository implements LmsRepository {
  readonly engineName = 'mysql' as const;

  constructor(private readonly db: LmsDb) {}

  private async insertAudit(
    executor: LmsDb | Parameters<Parameters<LmsDb['transaction']>[0]>[0],
    userId: number,
    aksi: string,
    entitas: string,
    entitasId: string,
    detail: string,
  ) {
    await executor.insert(schema.auditLogs).values({
      userId,
      aksi,
      entitas,
      entitasId,
      afterJson: { detail },
      ip: '127.0.0.1',
      userAgent: 'web',
    });
  }

  private async loadAllUsers(): Promise<User[]> {
    const [userRows, roleRows] = await Promise.all([
      this.db.select().from(schema.users),
      this.db.select().from(schema.userRoles),
    ]);

    const rolesByUserId = new Map<number, UserRole[]>();
    for (const r of roleRows) {
      const list = rolesByUserId.get(r.userId) ?? [];
      if (!list.includes(r.role)) list.push(r.role);
      rolesByUserId.set(r.userId, list);
    }

    return userRows.map((u) => {
      const extraRoles = rolesByUserId.get(u.id);
      const roles: UserRole[] =
        extraRoles && extraRoles.length > 0 ? extraRoles : [u.role];
      return {
        id: String(u.id),
        nama: u.nama,
        email: u.email,
        roles,
        status: u.status,
        last_login_at: toIsoString(u.lastLoginAt),
      };
    });
  }

  private async loadFullState(): Promise<LmsDatabaseState> {
    const [
      schoolRows,
      yearRows,
      majorRows,
      rombelRows,
      usersList,
      teacherRows,
      studentRows,
      bkRows,
      bkAssignRows,
      subjectRows,
      taRows,
      moduleRows,
      sessionRows,
      attRows,
      assignmentRows,
      submissionRows,
      notebookRows,
      nbEntryRows,
      gcRows,
      gradeRows,
      eraporRows,
      qbRows,
      questionRows,
      examRows,
      examSessionRows,
      examAnswerRows,
      dudiRows,
      pksRows,
      pklPlacementRows,
      pklJournalRows,
      pklScoreRows,
      mapelPklRows,
      promptTplRows,
      teacherDocRows,
      notifRows,
      auditRows,
      importBatchRows,
      coachingRows,
      waliNoteRows,
    ] = await Promise.all([
      this.db.select().from(schema.schools),
      this.db.select().from(schema.academicYears),
      this.db.select().from(schema.majors),
      this.db.select().from(schema.rombels),
      this.loadAllUsers(),
      this.db.select().from(schema.teachers),
      this.db.select().from(schema.students),
      this.db.select().from(schema.bkCounselors),
      this.db.select().from(schema.bkClassAssignments),
      this.db.select().from(schema.subjects),
      this.db.select().from(schema.teacherAssignments),
      this.db.select().from(schema.modules).orderBy(desc(schema.modules.id)),
      this.db.select().from(schema.sessions).orderBy(desc(schema.sessions.id)),
      this.db.select().from(schema.attendanceRecords),
      this.db.select().from(schema.assignments).orderBy(desc(schema.assignments.id)),
      this.db.select().from(schema.submissions).orderBy(desc(schema.submissions.id)),
      this.db.select().from(schema.notebooks),
      this.db.select().from(schema.notebookEntries).orderBy(desc(schema.notebookEntries.id)),
      this.db.select().from(schema.gradeComponents),
      this.db.select().from(schema.grades),
      this.db.select().from(schema.eraporColumnMappings),
      this.db.select().from(schema.questionBanks),
      this.db.select().from(schema.questions),
      this.db.select().from(schema.exams).orderBy(desc(schema.exams.id)),
      this.db.select().from(schema.examSessions),
      this.db.select().from(schema.examAnswers),
      this.db.select().from(schema.dudis),
      this.db.select().from(schema.pksDocuments),
      this.db.select().from(schema.pklPlacements),
      this.db.select().from(schema.pklJournals).orderBy(desc(schema.pklJournals.id)),
      this.db.select().from(schema.pklScores),
      this.db.select().from(schema.mapelPklContributions),
      this.db.select().from(schema.promptTemplates),
      this.db.select().from(schema.teacherDocuments).orderBy(desc(schema.teacherDocuments.id)),
      this.db.select().from(schema.notifications).orderBy(desc(schema.notifications.id)),
      this.db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.id)).limit(200),
      this.db.select().from(schema.importBatches).orderBy(desc(schema.importBatches.id)),
      this.db.select().from(schema.coachingNotes).orderBy(desc(schema.coachingNotes.id)),
      this.db.select().from(schema.walikelasNotes),
    ]);

    const schoolRow = schoolRows[0];
    const walikelasMap: Record<string, string> = {};
    for (const wn of waliNoteRows) {
      walikelasMap[String(wn.studentId)] = wn.catatan;
    }

    return {
      school: schoolRow
        ? {
            id: String(schoolRow.id),
            npsn: schoolRow.npsn,
            nama: schoolRow.nama,
            alamat: schoolRow.alamat,
            kepala_sekolah: schoolRow.kepalaSekolah,
            telepon: schoolRow.telepon,
            email: schoolRow.email,
            logo_url: schoolRow.logoUrl,
          }
        : {
            id: '1',
            npsn: '10214029',
            nama: 'SMK Negeri 1 Percut Sei Tuan',
            alamat: 'Jl. Kolam No. 3, Medan Estate',
            kepala_sekolah: 'Kepala Sekolah',
            telepon: '-',
            email: 'info@smkn1percut.sch.id',
            logo_url: '/src/assets/images/smkn1_emblem_1794859933905.jpg',
          },
      academic_years: yearRows.map((y) => ({
        id: String(y.id),
        tahun_ajaran: y.tahunAjaran,
        semester: y.semester,
        tanggal_mulai: toIsoDateOnly(y.tanggalMulai),
        tanggal_selesai: toIsoDateOnly(y.tanggalSelesai),
        is_active: y.isActive,
      })),
      majors: majorRows.map((m) => ({
        id: String(m.id),
        kode: m.kode,
        nama: m.nama,
      })),
      rombels: rombelRows.map((r) => ({
        id: String(r.id),
        tingkat: r.tingkat as 10 | 11 | 12,
        major_id: String(r.majorId),
        academic_year_id: String(r.academicYearId),
        kurikulum_acuan: r.kurikulumAcuan,
        nama_rombel: r.namaRombel,
        wali_kelas_id: r.waliKelasTeacherId ? String(r.waliKelasTeacherId) : null,
      })),
      users: usersList,
      teachers: teacherRows.map((t) => ({
        id: String(t.id),
        user_id: String(t.userId),
        nuptk: t.nuptk,
        nip: t.nip,
        bidang: t.bidang,
      })),
      students: studentRows.map((s) => ({
        id: String(s.id),
        user_id: String(s.userId),
        nisn: s.nisn,
        nis: s.nis,
        rombel_id: String(s.rombelId),
        jenis_kelamin: s.jenisKelamin,
        tanggal_lahir: toIsoDateOnly(s.tanggalLahir),
        status: s.status,
      })),
      bk_counselors: bkRows.map((b) => ({
        id: String(b.id),
        user_id: String(b.userId),
      })),
      bk_class_assignments: bkAssignRows.map((b) => ({
        id: String(b.id),
        bk_id: String(b.bkId),
        rombel_id: String(b.rombelId),
      })),
      subjects: subjectRows.map((s) => ({
        id: String(s.id),
        kode: s.kode,
        nama: s.nama,
        kelompok: s.kelompok,
      })),
      teacher_assignments: taRows.map((ta) => ({
        id: String(ta.id),
        teacher_id: String(ta.teacherId),
        subject_id: String(ta.subjectId),
        rombel_id: String(ta.rombelId),
        academic_year_id: String(ta.academicYearId),
        semester: ta.semester,
        kurikulum_acuan: ta.kurikulumAcuan,
        jam_per_minggu: ta.jamPerMinggu,
        status: ta.status,
      })),
      modules: moduleRows.map((m) => ({
        id: String(m.id),
        teacher_assignment_id: String(m.teacherAssignmentId),
        judul: m.judul,
        konten: m.konten,
        status: m.status,
        cloned_from: m.clonedFrom ? String(m.clonedFrom) : null,
        updated_at: toIsoString(m.updatedAt),
      })),
      sessions: sessionRows.map((s) => ({
        id: String(s.id),
        teacher_assignment_id: String(s.teacherAssignmentId),
        pertemuan_ke: s.pertemuanKe,
        tanggal: toIsoDateOnly(s.tanggal),
        jam_mulai: s.jamMulai,
        jam_selesai: s.jamSelesai,
        tipe_sesi: s.tipeSesi,
        topik: s.topik,
        module_id: s.moduleId ? String(s.moduleId) : null,
        status: s.status,
        minimum_read_pct: s.minimumReadPct,
      })),
      attendance_records: attRows.map((a) => ({
        id: String(a.id),
        session_id: String(a.sessionId),
        student_id: String(a.studentId),
        status: a.status,
        aktivitas_minimum_terpenuhi: a.aktivitasMinimumTerpenuhi,
        read_pct: a.readPct,
        submitted_task: a.submittedTask,
        submitted_reflection: a.submittedReflection,
        diakses_pada: a.diaksesPada ? toIsoString(a.diaksesPada) : null,
        diaktifkan_pada: a.diaktifkanPada ? toIsoString(a.diaktifkanPada) : null,
        override_oleh: a.overrideOleh ? String(a.overrideOleh) : null,
        alasan_override: a.alasanOverride ?? null,
      })),
      assignments: assignmentRows.map((t) => ({
        id: String(t.id),
        session_id: t.sessionId ? String(t.sessionId) : null,
        teacher_assignment_id: String(t.teacherAssignmentId),
        judul: t.judul,
        deskripsi: t.deskripsi,
        deadline: toIsoString(t.deadline),
        tipe: t.tipe,
        rubrik: t.rubrik ?? '',
        cloned_from: t.clonedFrom ? String(t.clonedFrom) : null,
      })),
      submissions: submissionRows.map((sub) => ({
        id: String(sub.id),
        assignment_id: String(sub.assignmentId),
        student_id: String(sub.studentId),
        file_url: sub.fileUrl ?? null,
        teks: sub.teks ?? null,
        submitted_at: toIsoString(sub.submittedAt),
        nilai: sub.nilai !== null ? Number(sub.nilai) : null,
        dinilai_oleh: sub.dinilaiOleh ? String(sub.dinilaiOleh) : null,
        catatan_guru: sub.catatanGuru ?? null,
      })),
      notebooks: notebookRows.map((nb) => ({
        id: String(nb.id),
        student_id: String(nb.studentId),
        subject_id: String(nb.subjectId),
        teacher_assignment_id: String(nb.teacherAssignmentId),
      })),
      notebook_entries: nbEntryRows.map((e) => ({
        id: String(e.id),
        notebook_id: String(e.notebookId),
        judul: e.judul,
        konten: e.konten,
        gambar_url: e.gambarUrl ?? null,
        komentar_guru: e.komentarGuru ?? null,
        created_at: toIsoString(e.createdAt),
        updated_at: toIsoString(e.updatedAt),
      })),
      grade_components: gcRows.map((c) => ({
        id: String(c.id),
        teacher_assignment_id: String(c.teacherAssignmentId),
        nama: c.nama,
        bobot: Number(c.bobot),
      })),
      grades: gradeRows.map((g) => ({
        id: String(g.id),
        student_id: String(g.studentId),
        teacher_assignment_id: String(g.teacherAssignmentId),
        component_id: String(g.componentId),
        nilai: Number(g.nilai),
        catatan: g.catatan ?? '',
      })),
      erapor_mappings: eraporRows.map((erm) => ({
        id: String(erm.id),
        academic_year_id: String(erm.academicYearId),
        mapel_id: erm.mapelId ? String(erm.mapelId) : null,
        template_name: erm.templateName,
        mapping: (Array.isArray(erm.mappingJson)
          ? erm.mappingJson
          : []) as EraporColumnMapping['mapping'],
        created_by: String(erm.createdBy),
      })),
      question_banks: qbRows.map((qb) => ({
        id: String(qb.id),
        subject_id: String(qb.subjectId),
        teacher_id: String(qb.teacherId),
        judul: qb.judul,
        kurikulum_acuan: qb.kurikulumAcuan,
      })),
      questions: questionRows.map((q) => ({
        id: String(q.id),
        bank_id: String(q.bankId),
        tipe: q.tipe,
        stem: q.stem,
        options: (Array.isArray(q.optionsJson) ? q.optionsJson : []) as string[],
        jawaban:
          typeof q.jawabanJson === 'string'
            ? q.jawabanJson
            : JSON.stringify(q.jawabanJson),
        rubrik: q.rubrik ?? '',
        skor: Number(q.skor),
        level_kognitif: q.levelKognitif as 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6',
      })),
      exams: examRows.map((ex) => ({
        id: String(ex.id),
        teacher_assignment_id: String(ex.teacherAssignmentId),
        tipe: ex.tipe,
        judul: ex.judul,
        waktu_mulai: toIsoString(ex.waktuMulai),
        durasi_menit: ex.durasiMenit,
        token: ex.token,
        status: ex.status,
        parent_exam_id: ex.parentExamId ? String(ex.parentExamId) : null,
      })),
      exam_sessions: examSessionRows.map((es) => ({
        id: String(es.id),
        exam_id: String(es.examId),
        student_id: String(es.studentId),
        status: es.status,
        started_at: es.startedAt ? toIsoString(es.startedAt) : null,
        finished_at: es.finishedAt ? toIsoString(es.finishedAt) : null,
        tab_switch_count: es.tabSwitchCount,
      })),
      exam_answers: examAnswerRows.map((ea) => ({
        id: String(ea.id),
        exam_session_id: String(ea.examSessionId),
        question_id: String(ea.questionId),
        jawaban:
          typeof ea.jawabanJson === 'string'
            ? ea.jawabanJson
            : JSON.stringify(ea.jawabanJson),
        skor: ea.skor !== null ? Number(ea.skor) : null,
        disimpan_pada: toIsoString(ea.disimpanPada),
      })),
      dudis: dudiRows.map((d) => ({
        id: String(d.id),
        nama: d.nama,
        alamat: d.alamat,
        bidang: d.bidang,
        kontak: d.kontak,
      })),
      pks_documents: pksRows.map((p) => ({
        id: String(p.id),
        dudi_id: String(p.dudiId),
        nomor: p.nomor,
        tanggal_mulai: toIsoDateOnly(p.tanggalMulai),
        tanggal_selesai: toIsoDateOnly(p.tanggalSelesai),
        file_url: p.fileUrl,
      })),
      pkl_placements: pklPlacementRows.map((p) => ({
        id: String(p.id),
        student_id: String(p.studentId),
        dudi_id: String(p.dudiId),
        pks_id: String(p.pksId),
        pembimbing_bk_id: String(p.pembimbingBkId),
        pembimbing_dudi_nama: p.pembimbingDudiNama,
        periode_mulai: toIsoDateOnly(p.periodeMulai),
        periode_selesai: toIsoDateOnly(p.periodeSelesai),
        status: p.status,
      })),
      pkl_journals: pklJournalRows.map((j) => ({
        id: String(j.id),
        placement_id: String(j.placementId),
        tanggal: toIsoDateOnly(j.tanggal),
        aktivitas: j.aktivitas,
        validasi_bk: j.validasiBk,
        catatan_bk: j.catatanBk ?? '',
      })),
      pkl_scores: pklScoreRows.map((s) => ({
        id: String(s.id),
        placement_id: String(s.placementId),
        komponen: s.komponen,
        nilai: Number(s.nilai),
        dinilai_oleh: String(s.dinilaiOleh),
      })),
      mapel_pkl_contributions: mapelPklRows.map((m) => ({
        id: String(m.id),
        student_id: String(m.studentId),
        subject_id: String(m.subjectId),
        nilai: Number(m.nilai),
        guru_id: String(m.guruId),
        catatan: m.catatan ?? '',
      })),
      prompt_templates: promptTplRows.map((tpl) => ({
        id: String(tpl.id),
        kode: tpl.kode,
        nama: tpl.nama,
        kategori: tpl.kategori,
        kurikulum_acuan: tpl.kurikulumAcuan,
        input_fields: (Array.isArray(tpl.inputSchemaJson)
          ? tpl.inputSchemaJson
          : []) as LmsDatabaseState['prompt_templates'][number]['input_fields'],
        template_body: tpl.templateBody,
        output_structure: tpl.outputStructure,
        validation_checklist: (Array.isArray(tpl.validationChecklistJson)
          ? tpl.validationChecklistJson
          : []) as string[],
        version: tpl.version,
        status: tpl.status,
      })),
      teacher_documents: teacherDocRows.map((d) => ({
        id: String(d.id),
        teacher_assignment_id: String(d.teacherAssignmentId),
        template_id: String(d.templateId),
        judul: d.judul,
        konten: d.konten,
        status: d.status,
        generated_prompt: '',
        generated_at: d.generatedAt ? toIsoString(d.generatedAt) : null,
        pasted_at: d.pastedAt ? toIsoString(d.pastedAt) : null,
        published_at: d.publishedAt ? toIsoString(d.publishedAt) : null,
        checklist_state:
          d.validationJson && typeof d.validationJson === 'object'
            ? (d.validationJson as Record<string, boolean>)
            : {},
      })),
      notifications: notifRows.map((n) => ({
        id: String(n.id),
        user_id: String(n.userId),
        tipe: n.tipe,
        judul: n.judul,
        pesan: n.pesan,
        entitas: n.entitas,
        entitas_id: n.entitasId,
        dibaca_at: n.dibacaAt ? toIsoString(n.dibacaAt) : null,
        created_at: toIsoString(n.createdAt),
      })),
      audit_logs: auditRows.map((a) => ({
        id: String(a.id),
        user_id: String(a.userId),
        aksi: a.aksi,
        entitas: a.entitas,
        entitas_id: a.entitasId,
        detail:
          a.afterJson &&
          typeof a.afterJson === 'object' &&
          'detail' in (a.afterJson as Record<string, unknown>)
            ? String((a.afterJson as Record<string, unknown>).detail)
            : `${a.aksi} (${a.entitas}#${a.entitasId})`,
        created_at: toIsoString(a.createdAt),
      })),
      import_batches: importBatchRows.map((b) => ({
        id: String(b.id),
        tipe: b.tipe,
        filename: b.fileUrl,
        status: b.status,
        total_baris: b.totalBaris,
        baris_sukses: b.barisSukses,
        baris_error: b.barisError,
        error_logs: (Array.isArray(b.errorLogJson)
          ? b.errorLogJson
          : []) as Array<{ row: number; reason: string }>,
        created_by: String(b.createdBy),
        created_at: toIsoString(b.createdAt),
      })),
      coaching_notes: coachingRows.map((c) => ({
        id: String(c.id),
        author_user_id: String(c.authorUserId),
        target_type: c.targetType,
        target_id: String(c.targetId),
        judul: c.judul,
        catatan: c.catatan,
        created_at: toIsoString(c.createdAt),
      })),
      walikelas_notes: walikelasMap,
      backup_history: listDiskBackupFiles(),
    };
  }

  async getBootstrapData(appMode: 'LMS' | 'CBT'): Promise<BootstrapPayload> {
    const [schoolRows, yearRows, usersList] = await Promise.all([
      this.db.select().from(schema.schools),
      this.db.select().from(schema.academicYears),
      this.loadAllUsers(),
    ]);

    const s = schoolRows[0];
    const activeYear = yearRows.find((y) => y.isActive) ?? yearRows[0];

    return {
      school: s
        ? {
            id: String(s.id),
            npsn: s.npsn,
            nama: s.nama,
            alamat: s.alamat,
            kepala_sekolah: s.kepalaSekolah,
            telepon: s.telepon,
            email: s.email,
            logo_url: s.logoUrl,
          }
        : {
            id: '1',
            npsn: '10214029',
            nama: 'SMK Negeri 1 Percut Sei Tuan',
            alamat: 'Jl. Kolam No. 3, Medan Estate',
            kepala_sekolah: 'Kepala Sekolah',
            telepon: '-',
            email: 'info@smkn1percut.sch.id',
            logo_url: '/src/assets/images/smkn1_emblem_1794859933905.jpg',
          },
      academic_year: activeYear
        ? {
            id: String(activeYear.id),
            tahun_ajaran: activeYear.tahunAjaran,
            semester: activeYear.semester,
            tanggal_mulai: toIsoDateOnly(activeYear.tanggalMulai),
            tanggal_selesai: toIsoDateOnly(activeYear.tanggalSelesai),
            is_active: activeYear.isActive,
          }
        : {
            id: '1',
            tahun_ajaran: '2025/2026',
            semester: 'GENAP',
            tanggal_mulai: '2026-01-05',
            tanggal_selesai: '2026-06-20',
            is_active: true,
          },
      app_mode: appMode,
      engine: this.engineName,
      allow_demo_reset: false,
      total_accounts: usersList.length,
      demo_users: usersList
        .filter((u) => CURATED_DEMO_EMAILS.has(u.email.toLowerCase()))
        .map((u) => ({
          id: u.id,
          nama: u.nama,
          email: u.email,
          roles: u.roles,
        })),
    };
  }

  async authenticateUser(identifierRaw: string, password: string) {
    const identifier = identifierRaw.trim().toLowerCase();
    if (!identifier || !password) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'identifier',
          message: 'Email/NISN/NUPTK dan kata sandi wajib diisi.',
        },
      };
    }

    const usersList = await this.loadAllUsers();
    let user = usersList.find(
      (u) => u.email.toLowerCase() === identifier && u.status === 'AKTIF',
    );
    if (!user) {
      const [stu] = await this.db
        .select()
        .from(schema.students)
        .where(
          sql`LOWER(${schema.students.nisn}) = ${identifier} OR LOWER(${schema.students.nis}) = ${identifier}`,
        )
        .limit(1);
      if (stu) {
        user = usersList.find(
          (u) => u.id === String(stu.userId) && u.status === 'AKTIF',
        );
      }
    }
    if (!user) {
      const [tch] = await this.db
        .select()
        .from(schema.teachers)
        .where(
          sql`LOWER(${schema.teachers.nuptk}) = ${identifier} OR LOWER(${schema.teachers.nip}) = ${identifier}`,
        )
        .limit(1);
      if (tch) {
        user = usersList.find(
          (u) => u.id === String(tch.userId) && u.status === 'AKTIF',
        );
      }
    }

    if (!user || password !== 'smkn1percut') {
      return {
        ok: false as const,
        error: {
          kind: 'UNAUTHORIZED' as const,
          httpStatus: 401 as const,
          message: 'Kredensial tidak valid. (Kata sandi demo: smkn1percut)',
        },
      };
    }

    const uid = Number(user.id);
    await this.db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, uid));
    await this.insertAudit(
      this.db,
      uid,
      'LOGIN',
      'users',
      user.id,
      `Login berhasil sebagai ${user.roles.join(', ')}`,
    );
    return { ok: true as const, value: user };
  }

  async resolveAuthContext(
    userId?: string,
    requestedRole?: UserRole,
  ): Promise<AuthContext | null> {
    const uid = userId ? parseIntId(userId) : null;
    if (!uid) return null;

    const [userRow] = await this.db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, uid), eq(schema.users.status, 'AKTIF')))
      .limit(1);
    if (!userRow) return null;

    const [roleRows, teacherRows, studentRows, bkRows] = await Promise.all([
      this.db
        .select()
        .from(schema.userRoles)
        .where(eq(schema.userRoles.userId, uid)),
      this.db
        .select()
        .from(schema.teachers)
        .where(eq(schema.teachers.userId, uid))
        .limit(1),
      this.db
        .select()
        .from(schema.students)
        .where(eq(schema.students.userId, uid))
        .limit(1),
      this.db
        .select()
        .from(schema.bkCounselors)
        .where(eq(schema.bkCounselors.userId, uid))
        .limit(1),
    ]);

    const roles: UserRole[] =
      roleRows.length > 0 ? roleRows.map((r) => r.role) : [userRow.role];
    const activeRole =
      requestedRole && roles.includes(requestedRole) ? requestedRole : roles[0];

    const user: User = {
      id: String(userRow.id),
      nama: userRow.nama,
      email: userRow.email,
      roles,
      status: userRow.status,
      last_login_at: toIsoString(userRow.lastLoginAt),
    };

    return {
      user,
      activeRole,
      teacher: teacherRows[0]
        ? {
            id: String(teacherRows[0].id),
            user_id: String(teacherRows[0].userId),
            nuptk: teacherRows[0].nuptk,
            nip: teacherRows[0].nip,
            bidang: teacherRows[0].bidang,
          }
        : undefined,
      student: studentRows[0]
        ? {
            id: String(studentRows[0].id),
            user_id: String(studentRows[0].userId),
            nisn: studentRows[0].nisn,
            nis: studentRows[0].nis,
            rombel_id: String(studentRows[0].rombelId),
            jenis_kelamin: studentRows[0].jenisKelamin,
            tanggal_lahir: toIsoDateOnly(studentRows[0].tanggalLahir),
            status: studentRows[0].status,
          }
        : undefined,
      bkCounselor: bkRows[0]
        ? {
            id: String(bkRows[0].id),
            user_id: String(bkRows[0].userId),
          }
        : undefined,
    };
  }

  async getHealthCounts(): Promise<HealthCounts> {
    const [maj, rom, stu, tch, bk, pkl] = await Promise.all([
      this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.majors),
      this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.rombels),
      this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.students),
      this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.teachers),
      this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.bkCounselors),
      this.db.select({ c: sql<number>`COUNT(*)` }).from(schema.pklPlacements),
    ]);
    return {
      majors: Number(maj[0]?.c ?? 0),
      rombels: Number(rom[0]?.c ?? 0),
      students: Number(stu[0]?.c ?? 0),
      teachers: Number(tch[0]?.c ?? 0),
      bk_counselors: Number(bk[0]?.c ?? 0),
      pkl_placements: Number(pkl[0]?.c ?? 0),
    };
  }

  async getWorkspaceState(ctx: AuthContext): Promise<WorkspaceStatePayload> {
    const full = await this.loadFullState();
    const visibleEntries = full.notebook_entries.filter((entry) => {
      const nb = full.notebooks.find((n) => n.id === entry.notebook_id);
      if (!nb) return false;
      const ta = full.teacher_assignments.find(
        (a) => a.id === nb.teacher_assignment_id,
      );
      return guardNotebookContentRead(ctx, nb, ta).ok;
    });

    const notebookMetadata: NotebookMetadataSummary[] = full.notebooks.map(
      (nb) => summarizeNotebookMetadata(nb, full.notebook_entries),
    );

    return {
      auth: ctx,
      state: {
        ...full,
        notebook_entries: visibleEntries,
        notebook_metadata: notebookMetadata,
      },
    };
  }

  async getNotebookEntries(ctx: AuthContext, notebookId: string) {
    const nbId = parseIntId(notebookId);
    if (!nbId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'notebooks',
          id: notebookId,
          message: 'Buku tulis tidak ditemukan.',
        },
      };
    }
    const [nbRow] = await this.db
      .select()
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, nbId))
      .limit(1);
    if (!nbRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'notebooks',
          id: notebookId,
          message: 'Buku tulis tidak ditemukan.',
        },
      };
    }
    const [taRow] = await this.db
      .select()
      .from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, nbRow.teacherAssignmentId))
      .limit(1);

    const nb = {
      id: String(nbRow.id),
      student_id: String(nbRow.studentId),
      subject_id: String(nbRow.subjectId),
      teacher_assignment_id: String(nbRow.teacherAssignmentId),
    };
    const ta = taRow
      ? {
          id: String(taRow.id),
          teacher_id: String(taRow.teacherId),
          subject_id: String(taRow.subjectId),
          rombel_id: String(taRow.rombelId),
          academic_year_id: String(taRow.academicYearId),
          semester: taRow.semester,
          kurikulum_acuan: taRow.kurikulumAcuan,
          jam_per_minggu: taRow.jamPerMinggu,
          status: taRow.status,
        }
      : undefined;

    const guard = guardNotebookContentRead(ctx, nb, ta);
    if (!guard.ok) return guard;

    const rows = await this.db
      .select()
      .from(schema.notebookEntries)
      .where(eq(schema.notebookEntries.notebookId, nbId))
      .orderBy(desc(schema.notebookEntries.id));

    return {
      ok: true as const,
      value: rows.map((e) => ({
        id: String(e.id),
        notebook_id: String(e.notebookId),
        judul: e.judul,
        konten: e.konten,
        gambar_url: e.gambarUrl ?? null,
        komentar_guru: e.komentarGuru ?? null,
        created_at: toIsoString(e.createdAt),
        updated_at: toIsoString(e.updatedAt),
      })),
    };
  }

  async createNotebookEntry(
    ctx: AuthContext,
    subjectId: string,
    input: { judul: string; konten: string; gambar_url?: string | null },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa pemilik yang dapat menulis buku tulis.',
        },
      };
    }
    const subIdNum = parseIntId(subjectId);
    if (!subIdNum || !input.judul?.trim() || !input.konten?.trim()) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'judul',
          message: 'Judul, mata pelajaran, dan isi catatan wajib diisi.',
        },
      };
    }

    const stuIdNum = Number(ctx.student.id);
    const rombelIdNum = Number(ctx.student.rombel_id);

    return this.db.transaction(async (tx) => {
      const [taRow] = await tx
        .select()
        .from(schema.teacherAssignments)
        .where(
          and(
            eq(schema.teacherAssignments.rombelId, rombelIdNum),
            eq(schema.teacherAssignments.subjectId, subIdNum),
          ),
        )
        .limit(1);

      if (!taRow) {
        return {
          ok: false as const,
          error: {
            kind: 'NOT_FOUND' as const,
            httpStatus: 404 as const,
            entity: 'teacher_assignments',
            id: subjectId,
            message: 'Mapel tidak ditemukan untuk kelas Anda.',
          },
        };
      }

      let [nbRow] = await tx
        .select()
        .from(schema.notebooks)
        .where(
          and(
            eq(schema.notebooks.studentId, stuIdNum),
            eq(schema.notebooks.teacherAssignmentId, taRow.id),
          ),
        )
        .limit(1);

      if (!nbRow) {
        const [{ id: newNbId }] = await tx
          .insert(schema.notebooks)
          .values({
            studentId: stuIdNum,
            subjectId: subIdNum,
            teacherAssignmentId: taRow.id,
          })
          .$returningId();
        nbRow = {
          id: newNbId,
          studentId: stuIdNum,
          subjectId: subIdNum,
          teacherAssignmentId: taRow.id,
        };
      }

      const [{ id: newEntryId }] = await tx
        .insert(schema.notebookEntries)
        .values({
          notebookId: nbRow.id,
          judul: input.judul.trim(),
          konten: input.konten.trim(),
          gambarUrl: input.gambar_url ? String(input.gambar_url) : null,
        })
        .$returningId();

      const nowIso = new Date().toISOString();
      await this.insertAudit(
        tx,
        Number(ctx.user.id),
        'NOTEBOOK_ENTRY_CREATE',
        'notebook_entries',
        String(newEntryId),
        `Siswa menulis catatan buku tulis "${input.judul.trim()}"`,
      );

      return {
        ok: true as const,
        value: {
          id: String(newEntryId),
          notebook_id: String(nbRow.id),
          judul: input.judul.trim(),
          konten: input.konten.trim(),
          gambar_url: input.gambar_url ? String(input.gambar_url) : null,
          komentar_guru: null,
          created_at: nowIso,
          updated_at: nowIso,
        },
      };
    });
  }

  async commentNotebookEntry(
    ctx: AuthContext,
    entryId: string,
    komentar: string,
  ) {
    const eid = parseIntId(entryId);
    if (!eid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'notebook_entries',
          id: entryId,
          message: 'Entri buku tulis tidak ditemukan.',
        },
      };
    }

    const [entryRow] = await this.db
      .select()
      .from(schema.notebookEntries)
      .where(eq(schema.notebookEntries.id, eid))
      .limit(1);
    if (!entryRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'notebook_entries',
          id: entryId,
          message: 'Entri buku tulis tidak ditemukan.',
        },
      };
    }

    const [nbRow] = await this.db
      .select()
      .from(schema.notebooks)
      .where(eq(schema.notebooks.id, entryRow.notebookId))
      .limit(1);
    const [taRow] = nbRow
      ? await this.db
          .select()
          .from(schema.teacherAssignments)
          .where(eq(schema.teacherAssignments.id, nbRow.teacherAssignmentId))
          .limit(1)
      : [];

    const ta = taRow
      ? {
          id: String(taRow.id),
          teacher_id: String(taRow.teacherId),
          subject_id: String(taRow.subjectId),
          rombel_id: String(taRow.rombelId),
          academic_year_id: String(taRow.academicYearId),
          semester: taRow.semester,
          kurikulum_acuan: taRow.kurikulumAcuan,
          jam_per_minggu: taRow.jamPerMinggu,
          status: taRow.status,
        }
      : undefined;

    const guard = guardTeacherAssignmentOwnership(
      ctx,
      ta,
      'komentar buku tulis',
    );
    if (!guard.ok) return guard;

    const trimmed = komentar.trim();
    await this.db
      .update(schema.notebookEntries)
      .set({ komentarGuru: trimmed })
      .where(eq(schema.notebookEntries.id, eid));

    return {
      ok: true as const,
      value: {
        id: String(entryRow.id),
        notebook_id: String(entryRow.notebookId),
        judul: entryRow.judul,
        konten: entryRow.konten,
        gambar_url: entryRow.gambarUrl ?? null,
        komentar_guru: trimmed,
        created_at: toIsoString(entryRow.createdAt),
        updated_at: new Date().toISOString(),
      },
    };
  }

  private async getDomainTaById(taIdStr: string) {
    const taId = parseIntId(taIdStr);
    if (!taId) return undefined;
    const [r] = await this.db
      .select()
      .from(schema.teacherAssignments)
      .where(eq(schema.teacherAssignments.id, taId))
      .limit(1);
    if (!r) return undefined;
    return {
      id: String(r.id),
      teacher_id: String(r.teacherId),
      subject_id: String(r.subjectId),
      rombel_id: String(r.rombelId),
      academic_year_id: String(r.academicYearId),
      semester: r.semester,
      kurikulum_acuan: r.kurikulumAcuan,
      jam_per_minggu: r.jamPerMinggu,
      status: r.status,
    };
  }

  async createSession(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      topik: string;
      tanggal?: string;
      jam_mulai: string;
      jam_selesai: string;
      tipe_sesi?: SessionType;
      module_id?: string | null;
      minimum_read_pct?: number;
    },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'sesi pembelajaran');
    if (!guard.ok) return guard;

    if (!input.topik?.trim() || !input.jam_mulai || !input.jam_selesai) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'topik',
          message: 'Topik, jam mulai, dan jam selesai wajib diisi.',
        },
      };
    }

    const taId = Number(ta!.id);
    const modId = input.module_id ? parseIntId(input.module_id) : null;
    const tanggalStr = input.tanggal || new Date().toISOString().slice(0, 10);
    const minPct = Number(input.minimum_read_pct ?? 60);
    const tipeSesi = input.tipe_sesi || ('TEORI' as const);

    return this.db.transaction(async (tx) => {
      const [cnt] = await tx
        .select({ c: sql<number>`COUNT(*)` })
        .from(schema.sessions)
        .where(eq(schema.sessions.teacherAssignmentId, taId));

      const pertemuanKe = Number(cnt?.c ?? 0) + 1;
      const [{ id: newId }] = await tx
        .insert(schema.sessions)
        .values({
          teacherAssignmentId: taId,
          pertemuanKe,
          tanggal: new Date(tanggalStr),
          jamMulai: input.jam_mulai,
          jamSelesai: input.jam_selesai,
          tipeSesi,
          topik: input.topik.trim(),
          moduleId: modId,
          minimumReadPct: minPct,
          status: 'OPEN',
        })
        .$returningId();

      await this.insertAudit(
        tx,
        Number(ctx.user.id),
        'CREATE_SESSION',
        'sessions',
        String(newId),
        `Membuka sesi pertemuan ${pertemuanKe}: ${input.topik.trim()}`,
      );

      return {
        ok: true as const,
        value: {
          id: String(newId),
          teacher_assignment_id: ta!.id,
          pertemuan_ke: pertemuanKe,
          tanggal: tanggalStr,
          jam_mulai: input.jam_mulai,
          jam_selesai: input.jam_selesai,
          tipe_sesi: tipeSesi,
          topik: input.topik.trim(),
          module_id: modId ? String(modId) : null,
          status: 'OPEN' as const,
          minimum_read_pct: minPct,
        },
      };
    });
  }

  async updateSessionStatus(
    ctx: AuthContext,
    sessionId: string,
    status: 'OPEN' | 'CLOSED' | 'DRAFT',
  ) {
    const sid = parseIntId(sessionId);
    if (!sid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }
    const [sesRow] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sid))
      .limit(1);
    if (!sesRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }
    const ta = await this.getDomainTaById(String(sesRow.teacherAssignmentId));
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'status sesi');
    if (!guard.ok) return guard;

    await this.db
      .update(schema.sessions)
      .set({ status })
      .where(eq(schema.sessions.id, sid));
    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      `SESSION_${status}`,
      'sessions',
      String(sid),
      `Mengubah status sesi "${sesRow.topik}" menjadi ${status}`,
    );
    return { ok: true as const, value: undefined };
  }

  async recordSessionAccess(
    ctx: AuthContext,
    sessionId: string,
    input: {
      readPct: number;
      submittedTask?: boolean;
      submittedReflection?: boolean;
      simulatedTimeHHmm?: string;
    },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat mencatat kehadiran sesi.',
        },
      };
    }
    const sid = parseIntId(sessionId);
    if (!sid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }

    const stuId = Number(ctx.student.id);
    return this.db.transaction(async (tx) => {
      const [sesRow] = await tx
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sid))
        .limit(1);
      if (!sesRow) {
        return {
          ok: false as const,
          error: {
            kind: 'NOT_FOUND' as const,
            httpStatus: 404 as const,
            entity: 'sessions',
            id: sessionId,
            message: 'Sesi tidak ditemukan.',
          },
        };
      }
      const [taRow] = await tx
        .select()
        .from(schema.teacherAssignments)
        .where(eq(schema.teacherAssignments.id, sesRow.teacherAssignmentId))
        .limit(1);
      if (!taRow || String(taRow.rombelId) !== ctx.student!.rombel_id) {
        return {
          ok: false as const,
          error: {
            kind: 'FORBIDDEN' as const,
            httpStatus: 403 as const,
            message: 'Anda tidak terdaftar di rombel sesi ini.',
          },
        };
      }

      const [existingRow] = await tx
        .select()
        .from(schema.attendanceRecords)
        .where(
          and(
            eq(schema.attendanceRecords.sessionId, sid),
            eq(schema.attendanceRecords.studentId, stuId),
          ),
        )
        .limit(1);

      const now = new Date();
      const hhmm =
        input.simulatedTimeHHmm ||
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const domainSession = {
        id: String(sesRow.id),
        teacher_assignment_id: String(sesRow.teacherAssignmentId),
        pertemuan_ke: sesRow.pertemuanKe,
        tanggal: toIsoDateOnly(sesRow.tanggal),
        jam_mulai: sesRow.jamMulai,
        jam_selesai: sesRow.jamSelesai,
        tipe_sesi: sesRow.tipeSesi,
        topik: sesRow.topik,
        module_id: sesRow.moduleId ? String(sesRow.moduleId) : null,
        status: sesRow.status,
        minimum_read_pct: sesRow.minimumReadPct,
      };
      const existingDomain = existingRow
        ? {
            id: String(existingRow.id),
            session_id: String(existingRow.sessionId),
            student_id: String(existingRow.studentId),
            status: existingRow.status,
            aktivitas_minimum_terpenuhi: existingRow.aktivitasMinimumTerpenuhi,
            read_pct: existingRow.readPct,
            submitted_task: existingRow.submittedTask,
            submitted_reflection: existingRow.submittedReflection,
            diakses_pada: existingRow.diaksesPada
              ? toIsoString(existingRow.diaksesPada)
              : null,
            diaktifkan_pada: existingRow.diaktifkanPada
              ? toIsoString(existingRow.diaktifkanPada)
              : null,
            override_oleh: existingRow.overrideOleh
              ? String(existingRow.overrideOleh)
              : null,
            alasan_override: existingRow.alasanOverride ?? null,
          }
        : undefined;

      const evalRes = evaluateSessionAccess({
        existingRecord: existingDomain,
        session: domainSession,
        studentId: ctx.student!.id,
        accessTimeHHmm: hhmm,
        timestampIso: now.toISOString(),
        activity: {
          readPct: Number(input.readPct ?? 0),
          submittedTask: Boolean(input.submittedTask),
          submittedReflection: Boolean(input.submittedReflection),
        },
      });
      if (!evalRes.ok) return evalRes;

      const rec = evalRes.value;
      await tx
        .insert(schema.attendanceRecords)
        .values({
          sessionId: sid,
          studentId: stuId,
          status: rec.status,
          aktivitasMinimumTerpenuhi: rec.aktivitas_minimum_terpenuhi,
          readPct: rec.read_pct,
          submittedTask: rec.submitted_task,
          submittedReflection: rec.submitted_reflection,
          diaksesPada: rec.diakses_pada ? new Date(rec.diakses_pada) : now,
          diaktifkanPada: rec.diaktifkan_pada
            ? new Date(rec.diaktifkan_pada)
            : null,
          overrideOleh: rec.override_oleh ? Number(rec.override_oleh) : null,
          alasanOverride: rec.alasan_override,
        })
        .onDuplicateKeyUpdate({
          set: {
            status: rec.status,
            aktivitasMinimumTerpenuhi: rec.aktivitas_minimum_terpenuhi,
            readPct: rec.read_pct,
            submittedTask: rec.submitted_task,
            submittedReflection: rec.submitted_reflection,
            diaktifkanPada: rec.diaktifkan_pada
              ? new Date(rec.diaktifkan_pada)
              : null,
          },
        });

      const [saved] = await tx
        .select()
        .from(schema.attendanceRecords)
        .where(
          and(
            eq(schema.attendanceRecords.sessionId, sid),
            eq(schema.attendanceRecords.studentId, stuId),
          ),
        )
        .limit(1);

      await this.insertAudit(
        tx,
        Number(ctx.user.id),
        `SESSION_ACCESS_${rec.status}`,
        'attendance_records',
        String(saved.id),
        `Akses sesi "${sesRow.topik}" pada ${hhmm} -> ${rec.status} (baca: ${rec.read_pct}%)`,
      );

      return {
        ok: true as const,
        value: { ...rec, id: String(saved.id) },
      };
    });
  }

  async overrideSessionAttendance(
    ctx: AuthContext,
    sessionId: string,
    input: { student_id: string; status: AttendanceStatus; alasan: string },
  ) {
    const sid = parseIntId(sessionId);
    const stuId = parseIntId(input.student_id);
    if (!sid || !stuId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi atau siswa tidak ditemukan.',
        },
      };
    }

    const [sesRow] = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sid))
      .limit(1);
    if (!sesRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'sessions',
          id: sessionId,
          message: 'Sesi tidak ditemukan.',
        },
      };
    }

    const ta = await this.getDomainTaById(String(sesRow.teacherAssignmentId));
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'override absensi');
    if (!guard.ok) return guard;

    const [existingRow] = await this.db
      .select()
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.sessionId, sid),
          eq(schema.attendanceRecords.studentId, stuId),
        ),
      )
      .limit(1);

    const existingDomain = existingRow
      ? {
          id: String(existingRow.id),
          session_id: String(existingRow.sessionId),
          student_id: String(existingRow.studentId),
          status: existingRow.status,
          aktivitas_minimum_terpenuhi: existingRow.aktivitasMinimumTerpenuhi,
          read_pct: existingRow.readPct,
          submitted_task: existingRow.submittedTask,
          submitted_reflection: existingRow.submittedReflection,
          diakses_pada: existingRow.diaksesPada
            ? toIsoString(existingRow.diaksesPada)
            : null,
          diaktifkan_pada: existingRow.diaktifkanPada
            ? toIsoString(existingRow.diaktifkanPada)
            : null,
          override_oleh: existingRow.overrideOleh
            ? String(existingRow.overrideOleh)
            : null,
          alasan_override: existingRow.alasanOverride ?? null,
        }
      : undefined;

    const overrideRes = applyTeacherAttendanceOverride({
      existingRecord: existingDomain,
      sessionId,
      studentId: input.student_id,
      newStatus: input.status,
      teacherUserId: ctx.user.id,
      reason: String(input.alasan ?? ''),
      timestampIso: new Date().toISOString(),
    });
    if (!overrideRes.ok) return overrideRes;

    const rec = overrideRes.value;
    await this.db
      .insert(schema.attendanceRecords)
      .values({
        sessionId: sid,
        studentId: stuId,
        status: rec.status,
        aktivitasMinimumTerpenuhi: rec.aktivitas_minimum_terpenuhi,
        readPct: rec.read_pct,
        submittedTask: rec.submitted_task,
        submittedReflection: rec.submitted_reflection,
        diaksesPada: rec.diakses_pada ? new Date(rec.diakses_pada) : null,
        diaktifkanPada: rec.diaktifkan_pada
          ? new Date(rec.diaktifkan_pada)
          : null,
        overrideOleh: Number(ctx.user.id),
        alasanOverride: rec.alasan_override,
      })
      .onDuplicateKeyUpdate({
        set: {
          status: rec.status,
          aktivitasMinimumTerpenuhi: rec.aktivitas_minimum_terpenuhi,
          overrideOleh: Number(ctx.user.id),
          alasanOverride: rec.alasan_override,
        },
      });

    const [saved] = await this.db
      .select()
      .from(schema.attendanceRecords)
      .where(
        and(
          eq(schema.attendanceRecords.sessionId, sid),
          eq(schema.attendanceRecords.studentId, stuId),
        ),
      )
      .limit(1);

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'OVERRIDE_ATTENDANCE',
      'attendance_records',
      String(saved.id),
      `Override absensi siswa ${input.student_id} menjadi ${input.status}. Alasan: ${rec.alasan_override}`,
    );

    return { ok: true as const, value: { ...rec, id: String(saved.id) } };
  }

  async createModule(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      judul: string;
      konten: string;
      status?: 'DRAFT' | 'PUBLISHED';
    },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'modul belajar');
    if (!guard.ok) return guard;

    const [{ id: newId }] = await this.db
      .insert(schema.modules)
      .values({
        teacherAssignmentId: Number(ta!.id),
        judul: String(input.judul ?? '').trim(),
        konten: String(input.konten ?? '').trim(),
        status: input.status || 'PUBLISHED',
        clonedFrom: null,
      })
      .$returningId();

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'CREATE_MODULE',
      'modules',
      String(newId),
      `Membuat modul "${String(input.judul ?? '').trim()}"`,
    );

    return {
      ok: true as const,
      value: {
        id: String(newId),
        teacher_assignment_id: ta!.id,
        judul: String(input.judul ?? '').trim(),
        konten: String(input.konten ?? '').trim(),
        status: input.status || ('PUBLISHED' as const),
        cloned_from: null,
        updated_at: new Date().toISOString(),
      },
    };
  }

  async cloneModule(
    ctx: AuthContext,
    sourceModuleId: string,
    targetAssignmentId: string,
  ) {
    if (!ctx.teacher) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya guru yang dapat melakukan clone modul.',
        },
      };
    }
    const modId = parseIntId(sourceModuleId);
    if (!modId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'modules',
          id: sourceModuleId,
          message: 'Modul sumber tidak ditemukan.',
        },
      };
    }
    const [sourceMod] = await this.db
      .select()
      .from(schema.modules)
      .where(eq(schema.modules.id, modId))
      .limit(1);
    if (!sourceMod) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'modules',
          id: sourceModuleId,
          message: 'Modul sumber tidak ditemukan.',
        },
      };
    }

    const [sourceTa, targetTa] = await Promise.all([
      this.getDomainTaById(String(sourceMod.teacherAssignmentId)),
      this.getDomainTaById(targetAssignmentId),
    ]);
    const cloneCheck = canCloneBetweenAssignments(
      ctx.teacher.id,
      sourceTa,
      targetTa,
    );
    if (!cloneCheck.ok) return cloneCheck;

    const [{ id: newId }] = await this.db
      .insert(schema.modules)
      .values({
        teacherAssignmentId: Number(targetTa!.id),
        judul: sourceMod.judul,
        konten: sourceMod.konten,
        status: sourceMod.status,
        clonedFrom: sourceMod.id,
      })
      .$returningId();

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'CLONE_MODULE',
      'modules',
      String(newId),
      `Clone modul "${sourceMod.judul}" ke assignment ${targetTa!.id}`,
    );

    return {
      ok: true as const,
      value: {
        id: String(newId),
        teacher_assignment_id: targetTa!.id,
        judul: sourceMod.judul,
        konten: sourceMod.konten,
        status: sourceMod.status,
        cloned_from: String(sourceMod.id),
        updated_at: new Date().toISOString(),
      },
    };
  }

  async createTask(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      judul: string;
      deskripsi: string;
      deadline?: string;
      tipe?: 'PR' | 'TUGAS' | 'PROYEK' | 'PRAKTIK';
      rubrik?: string;
      session_id?: string | null;
    },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'tugas');
    if (!guard.ok) return guard;

    const deadlineDate = input.deadline
      ? new Date(input.deadline)
      : new Date(Date.now() + 86400000 * 5);
    const tipe = input.tipe || ('TUGAS' as const);
    const sesId = input.session_id ? parseIntId(input.session_id) : null;

    const [{ id: newId }] = await this.db
      .insert(schema.assignments)
      .values({
        sessionId: sesId,
        teacherAssignmentId: Number(ta!.id),
        judul: String(input.judul).trim(),
        deskripsi: String(input.deskripsi).trim(),
        deadline: deadlineDate,
        tipe,
        rubrik: String(input.rubrik || ''),
        clonedFrom: null,
      })
      .$returningId();

    return {
      ok: true as const,
      value: {
        id: String(newId),
        session_id: sesId ? String(sesId) : null,
        teacher_assignment_id: ta!.id,
        judul: String(input.judul).trim(),
        deskripsi: String(input.deskripsi).trim(),
        deadline: deadlineDate.toISOString(),
        tipe,
        rubrik: String(input.rubrik || ''),
        cloned_from: null,
      },
    };
  }

  async submitTask(
    ctx: AuthContext,
    taskId: string,
    input: { teks: string; file_url?: string | null },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat mengumpulkan tugas.',
        },
      };
    }
    const tid = parseIntId(taskId);
    if (!tid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'assignments',
          id: taskId,
          message: 'Tugas tidak ditemukan.',
        },
      };
    }

    const [task] = await this.db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, tid))
      .limit(1);
    if (!task) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'assignments',
          id: taskId,
          message: 'Tugas tidak ditemukan.',
        },
      };
    }

    const teks = String(input.teks ?? '').trim();
    if (!teks && !input.file_url) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'teks',
          message: 'Jawaban teks atau lampiran berkas wajib diisi.',
        },
      };
    }

    const stuId = Number(ctx.student.id);
    const finalText = teks || 'Lampiran berkas terunggah.';
    const finalUrl = input.file_url ? String(input.file_url) : null;

    await this.db
      .insert(schema.submissions)
      .values({
        assignmentId: tid,
        studentId: stuId,
        fileUrl: finalUrl,
        teks: finalText,
        submittedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          teks: finalText,
          fileUrl: finalUrl ?? undefined,
          submittedAt: new Date(),
        },
      });

    const [saved] = await this.db
      .select()
      .from(schema.submissions)
      .where(
        and(
          eq(schema.submissions.assignmentId, tid),
          eq(schema.submissions.studentId, stuId),
        ),
      )
      .limit(1);

    return {
      ok: true as const,
      value: {
        id: String(saved.id),
        assignment_id: String(saved.assignmentId),
        student_id: String(saved.studentId),
        file_url: saved.fileUrl ?? null,
        teks: saved.teks ?? null,
        submitted_at: toIsoString(saved.submittedAt),
        nilai: saved.nilai !== null ? Number(saved.nilai) : null,
        dinilai_oleh: saved.dinilaiOleh ? String(saved.dinilaiOleh) : null,
        catatan_guru: saved.catatanGuru ?? null,
      },
    };
  }

  async gradeSubmission(
    ctx: AuthContext,
    submissionId: string,
    input: { nilai: number; catatan_guru?: string },
  ) {
    const subId = parseIntId(submissionId);
    if (!subId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'submissions',
          id: submissionId,
          message: 'Submission tidak ditemukan.',
        },
      };
    }
    const [sub] = await this.db
      .select()
      .from(schema.submissions)
      .where(eq(schema.submissions.id, subId))
      .limit(1);
    if (!sub) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'submissions',
          id: submissionId,
          message: 'Submission tidak ditemukan.',
        },
      };
    }
    const [task] = await this.db
      .select()
      .from(schema.assignments)
      .where(eq(schema.assignments.id, sub.assignmentId))
      .limit(1);
    const ta = task
      ? await this.getDomainTaById(String(task.teacherAssignmentId))
      : undefined;
    const guard = guardGradeMutation(ctx, ta);
    if (!guard.ok) return guard;

    const nilai = Number(input.nilai);
    if (Number.isNaN(nilai) || nilai < 0 || nilai > 100) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'nilai',
          message: 'Nilai harus berada pada rentang 0–100.',
        },
      };
    }

    const catatan = String(input.catatan_guru ?? '');
    await this.db
      .update(schema.submissions)
      .set({
        nilai: nilai.toFixed(2),
        dinilaiOleh: Number(ctx.teacher!.id),
        catatanGuru: catatan,
      })
      .where(eq(schema.submissions.id, subId));

    return {
      ok: true as const,
      value: {
        id: String(sub.id),
        assignment_id: String(sub.assignmentId),
        student_id: String(sub.studentId),
        file_url: sub.fileUrl ?? null,
        teks: sub.teks ?? null,
        submitted_at: toIsoString(sub.submittedAt),
        nilai,
        dinilai_oleh: ctx.teacher!.id,
        catatan_guru: catatan,
      },
    };
  }

  async upsertGrade(
    ctx: AuthContext,
    input: {
      student_id: string;
      teacher_assignment_id: string;
      component_id: string;
      nilai: number;
      catatan?: string;
    },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    const guard = guardGradeMutation(ctx, ta);
    if (!guard.ok) return guard;

    const stuId = parseIntId(input.student_id);
    const compId = parseIntId(input.component_id);
    if (!stuId || !compId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'grades',
          id: input.component_id,
          message: 'Siswa atau komponen nilai tidak ditemukan.',
        },
      };
    }

    const score = Number(input.nilai);
    if (Number.isNaN(score) || score < 0 || score > 100) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'nilai',
          message: 'Nilai harus antara 0 dan 100.',
        },
      };
    }

    const taId = Number(ta!.id);
    const catatan = String(input.catatan ?? '');

    await this.db
      .insert(schema.grades)
      .values({
        studentId: stuId,
        teacherAssignmentId: taId,
        componentId: compId,
        nilai: score.toFixed(2),
        catatan,
      })
      .onDuplicateKeyUpdate({
        set: {
          nilai: score.toFixed(2),
          catatan,
        },
      });

    const [saved] = await this.db
      .select()
      .from(schema.grades)
      .where(
        and(
          eq(schema.grades.studentId, stuId),
          eq(schema.grades.componentId, compId),
        ),
      )
      .limit(1);

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'UPSERT_GRADE',
      'grades',
      String(saved.id),
      `Input nilai ${score} untuk siswa ${input.student_id}`,
    );

    return {
      ok: true as const,
      value: {
        id: String(saved.id),
        student_id: input.student_id,
        teacher_assignment_id: input.teacher_assignment_id,
        component_id: input.component_id,
        nilai: Number(saved.nilai),
        catatan: saved.catatan ?? '',
      },
    };
  }

  async exportErapor(
    ctx: AuthContext,
    input: { teacher_assignment_id: string; mapping_id?: string },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'export e-Rapor');
    if (!guard.ok) return guard;

    const full = await this.loadFullState();
    const rombel = full.rombels.find((r) => r.id === ta!.rombel_id);
    if (!rombel) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'rombels',
          id: ta!.rombel_id,
          message: 'Rombel tidak ditemukan.',
        },
      };
    }

    const mapping =
      full.erapor_mappings.find((m) => m.id === input.mapping_id) ??
      full.erapor_mappings[0];
    const comps = full.grade_components.filter(
      (c) => c.teacher_assignment_id === ta!.id,
    );
    const grades = full.grades.filter(
      (g) => g.teacher_assignment_id === ta!.id,
    );

    const exportRes = generateEraporExport({
      mapping,
      rombel,
      students: full.students,
      users: full.users,
      components: comps,
      grades,
    });
    if (!exportRes.ok) return exportRes;

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'EXPORT_ERAPOR',
      'erapor_mappings',
      mapping.id,
      `Export e-Rapor kelas ${rombel.nama_rombel} (${exportRes.value.rows.length} siswa)`,
    );
    return { ok: true as const, value: exportRes.value };
  }

  async createExam(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      tipe?: ExamType;
      judul: string;
      waktu_mulai: string;
      durasi_menit: number;
      target_student_ids?: string[];
      parent_exam_id?: string | null;
    },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    if (input.tipe === 'SUSULAN') {
      const susulanGuard = guardSusulanExamCreation(ctx, ta);
      if (!susulanGuard.ok) return susulanGuard;
    } else {
      const guard = guardTeacherAssignmentOwnership(ctx, ta, 'jadwal CBT');
      if (!guard.ok) return guard;
    }

    return this.db.transaction(async (tx) => {
      const [examRows, taRows, stuRows, rombelRows, userRows] =
        await Promise.all([
          tx.select().from(schema.exams),
          tx.select().from(schema.teacherAssignments),
          tx.select().from(schema.students),
          tx.select().from(schema.rombels),
          tx.select().from(schema.users),
        ]);

      const overlapCheck = validateExamNoStudentOverlap({
        candidate: {
          id: 'candidate',
          teacher_assignment_id: ta!.id,
          waktu_mulai: input.waktu_mulai,
          durasi_menit: Number(input.durasi_menit),
          target_student_ids: input.target_student_ids,
        },
        existingExams: examRows.map((ex) => ({
          id: String(ex.id),
          teacher_assignment_id: String(ex.teacherAssignmentId),
          tipe: ex.tipe,
          judul: ex.judul,
          waktu_mulai: toIsoString(ex.waktuMulai),
          durasi_menit: ex.durasiMenit,
          token: ex.token,
          status: ex.status,
          parent_exam_id: ex.parentExamId ? String(ex.parentExamId) : null,
        })),
        assignments: taRows.map((r) => ({
          id: String(r.id),
          teacher_id: String(r.teacherId),
          subject_id: String(r.subjectId),
          rombel_id: String(r.rombelId),
          academic_year_id: String(r.academicYearId),
          semester: r.semester,
          kurikulum_acuan: r.kurikulumAcuan,
          jam_per_minggu: r.jamPerMinggu,
          status: r.status,
        })),
        students: stuRows.map((s) => ({
          id: String(s.id),
          user_id: String(s.userId),
          nisn: s.nisn,
          nis: s.nis,
          rombel_id: String(s.rombelId),
          jenis_kelamin: s.jenisKelamin,
          tanggal_lahir: toIsoDateOnly(s.tanggalLahir),
          status: s.status,
        })),
        rombels: rombelRows.map((r) => ({
          id: String(r.id),
          tingkat: r.tingkat as 10 | 11 | 12,
          major_id: String(r.majorId),
          academic_year_id: String(r.academicYearId),
          kurikulum_acuan: r.kurikulumAcuan,
          nama_rombel: r.namaRombel,
          wali_kelas_id: r.waliKelasTeacherId
            ? String(r.waliKelasTeacherId)
            : null,
        })),
        users: userRows.map((u) => ({
          id: String(u.id),
          nama: u.nama,
          email: u.email,
          roles: [u.role],
          status: u.status,
          last_login_at: toIsoString(u.lastLoginAt),
        })),
      });
      if (!overlapCheck.ok) return overlapCheck;

      const token = Math.random().toString(36).slice(2, 8).toUpperCase();
      const parentId = input.parent_exam_id
        ? parseIntId(input.parent_exam_id)
        : null;
      const tipe = input.tipe || ('CUSTOM' as const);

      const [{ id: newId }] = await tx
        .insert(schema.exams)
        .values({
          teacherAssignmentId: Number(ta!.id),
          tipe,
          judul: String(input.judul).trim(),
          waktuMulai: new Date(input.waktu_mulai),
          durasiMenit: Number(input.durasi_menit),
          token,
          status: 'AKTIF',
          parentExamId: parentId,
        })
        .$returningId();

      await this.insertAudit(
        tx,
        Number(ctx.user.id),
        'CREATE_CBT_EXAM',
        'exams',
        String(newId),
        `Membuat jadwal CBT "${String(input.judul).trim()}" (${tipe}) token ${token}`,
      );

      return {
        ok: true as const,
        value: {
          id: String(newId),
          teacher_assignment_id: ta!.id,
          tipe,
          judul: String(input.judul).trim(),
          waktu_mulai: input.waktu_mulai,
          durasi_menit: Number(input.durasi_menit),
          token,
          status: 'AKTIF' as const,
          parent_exam_id: parentId ? String(parentId) : null,
          target_student_ids: input.target_student_ids,
        },
      };
    });
  }

  async startExamSession(ctx: AuthContext, examId: string, token: string) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat memulai sesi CBT.',
        },
      };
    }
    const eid = parseIntId(examId);
    if (!eid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exams',
          id: examId,
          message: 'Ujian tidak ditemukan.',
        },
      };
    }

    const [examRow] = await this.db
      .select()
      .from(schema.exams)
      .where(eq(schema.exams.id, eid))
      .limit(1);
    if (!examRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exams',
          id: examId,
          message: 'Ujian tidak ditemukan.',
        },
      };
    }

    const tokenCheck = verifyExamToken(
      {
        id: String(examRow.id),
        teacher_assignment_id: String(examRow.teacherAssignmentId),
        tipe: examRow.tipe,
        judul: examRow.judul,
        waktu_mulai: toIsoString(examRow.waktuMulai),
        durasi_menit: examRow.durasiMenit,
        token: examRow.token,
        status: examRow.status,
        parent_exam_id: examRow.parentExamId
          ? String(examRow.parentExamId)
          : null,
      },
      token,
    );
    if (!tokenCheck.ok) return tokenCheck;

    const stuId = Number(ctx.student.id);
    const [existing] = await this.db
      .select()
      .from(schema.examSessions)
      .where(
        and(
          eq(schema.examSessions.examId, eid),
          eq(schema.examSessions.studentId, stuId),
        ),
      )
      .limit(1);

    if (existing) {
      return {
        ok: true as const,
        value: {
          id: String(existing.id),
          exam_id: String(existing.examId),
          student_id: String(existing.studentId),
          status: existing.status,
          started_at: existing.startedAt
            ? toIsoString(existing.startedAt)
            : null,
          finished_at: existing.finishedAt
            ? toIsoString(existing.finishedAt)
            : null,
          tab_switch_count: existing.tabSwitchCount,
        },
      };
    }

    const now = new Date();
    const [{ id: newId }] = await this.db
      .insert(schema.examSessions)
      .values({
        examId: eid,
        studentId: stuId,
        status: 'MENGERJAKAN',
        startedAt: now,
        tabSwitchCount: 0,
      })
      .$returningId();

    return {
      ok: true as const,
      value: {
        id: String(newId),
        exam_id: examId,
        student_id: ctx.student.id,
        status: 'MENGERJAKAN' as const,
        started_at: now.toISOString(),
        finished_at: null,
        tab_switch_count: 0,
      },
    };
  }

  async saveExamAnswer(
    ctx: AuthContext,
    examSessionId: string,
    input: { question_id: string; jawaban: string },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat menyimpan jawaban CBT.',
        },
      };
    }
    const sesId = parseIntId(examSessionId);
    const qId = parseIntId(input.question_id);
    if (!sesId || !qId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exam_sessions',
          id: examSessionId,
          message: 'Sesi ujian atau soal tidak ditemukan.',
        },
      };
    }

    const stuId = Number(ctx.student.id);
    const [sesRow] = await this.db
      .select()
      .from(schema.examSessions)
      .where(
        and(
          eq(schema.examSessions.id, sesId),
          eq(schema.examSessions.studentId, stuId),
        ),
      )
      .limit(1);
    if (!sesRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exam_sessions',
          id: examSessionId,
          message: 'Sesi ujian tidak ditemukan.',
        },
      };
    }
    if (sesRow.status === 'SELESAI') {
      return {
        ok: false as const,
        error: {
          kind: 'CONFLICT' as const,
          httpStatus: 409 as const,
          message: 'Ujian sudah diselesaikan.',
        },
      };
    }

    const jawabanStr = String(input.jawaban ?? '');
    await this.db
      .insert(schema.examAnswers)
      .values({
        examSessionId: sesId,
        questionId: qId,
        jawabanJson: jawabanStr,
        skor: null,
      })
      .onDuplicateKeyUpdate({
        set: {
          jawabanJson: jawabanStr,
        },
      });

    const [saved] = await this.db
      .select()
      .from(schema.examAnswers)
      .where(
        and(
          eq(schema.examAnswers.examSessionId, sesId),
          eq(schema.examAnswers.questionId, qId),
        ),
      )
      .limit(1);

    return {
      ok: true as const,
      value: {
        id: String(saved.id),
        exam_session_id: examSessionId,
        question_id: input.question_id,
        jawaban: jawabanStr,
        skor: saved.skor !== null ? Number(saved.skor) : null,
        disimpan_pada: toIsoString(saved.disimpanPada),
      },
    };
  }

  async finishExamSession(ctx: AuthContext, examSessionId: string) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa yang dapat menyelesaikan ujian.',
        },
      };
    }
    const sesId = parseIntId(examSessionId);
    if (!sesId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exam_sessions',
          id: examSessionId,
          message: 'Sesi ujian tidak ditemukan.',
        },
      };
    }

    const stuId = Number(ctx.student.id);
    const full = await this.loadFullState();
    const session = full.exam_sessions.find(
      (s) => s.id === examSessionId && s.student_id === ctx.student!.id,
    );
    if (!session) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'exam_sessions',
          id: examSessionId,
          message: 'Sesi ujian tidak ditemukan.',
        },
      };
    }

    const exam = full.exams.find((e) => e.id === session.exam_id);
    const ta = exam
      ? full.teacher_assignments.find(
          (a) => a.id === exam.teacher_assignment_id,
        )
      : undefined;
    const bank = ta
      ? full.question_banks.find((b) => b.subject_id === ta.subject_id)
      : undefined;
    const bankQuestions = bank
      ? full.questions.filter((q) => q.bank_id === bank.id)
      : full.questions;
    const myAnswers = full.exam_answers.filter(
      (a) => a.exam_session_id === session.id,
    );
    const summary = gradeStudentExamAnswers(bankQuestions, myAnswers);

    const finishedAt = new Date();
    await this.db
      .update(schema.examSessions)
      .set({ status: 'SELESAI', finishedAt })
      .where(
        and(
          eq(schema.examSessions.id, sesId),
          eq(schema.examSessions.studentId, stuId),
        ),
      );

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'FINISH_CBT',
      'exam_sessions',
      session.id,
      `Menyelesaikan CBT dengan skor objektif ${summary.percentage}%`,
    );

    return {
      ok: true as const,
      value: {
        exam_session: {
          ...session,
          status: 'SELESAI' as const,
          finished_at: finishedAt.toISOString(),
        },
        summary,
      },
    };
  }

  async generatePrompt(
    ctx: AuthContext,
    input: {
      teacher_assignment_id: string;
      template_id: string;
      teacher_inputs: Record<string, string>;
    },
  ) {
    const full = await this.loadFullState();
    const ta = full.teacher_assignments.find(
      (a) => a.id === input.teacher_assignment_id,
    );
    const guard = guardTeacherAssignmentOwnership(ctx, ta, 'perangkat ajar');
    if (!guard.ok) return guard;

    const template = full.prompt_templates.find(
      (t) => t.id === input.template_id,
    );
    if (!template) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'prompt_templates',
          id: input.template_id,
          message: 'Template prompt tidak ditemukan.',
        },
      };
    }

    const rombel = full.rombels.find((r) => r.id === ta!.rombel_id)!;
    const major = full.majors.find((m) => m.id === rombel.major_id)!;
    const subject = full.subjects.find((s) => s.id === ta!.subject_id)!;
    const academicYear = full.academic_years.find(
      (y) => y.id === ta!.academic_year_id,
    )!;
    const studentCount = full.students.filter(
      (s) => s.rombel_id === rombel.id,
    ).length;

    return assemblePromptForTeacher({
      template,
      context: {
        school: full.school,
        academicYear,
        teacherUser: ctx.user,
        teacherNip: ctx.teacher?.nip ?? '-',
        subject,
        rombel,
        major,
        assignment: ta!,
        studentCount,
      },
      teacherInputs: input.teacher_inputs ?? {},
    });
  }

  async saveTeacherDocument(
    ctx: AuthContext,
    input: {
      id?: string | null;
      teacher_assignment_id: string;
      template_id: string;
      judul: string;
      konten: string;
      generated_prompt?: string;
      checklist_state?: Record<string, boolean>;
    },
  ) {
    const ta = await this.getDomainTaById(input.teacher_assignment_id);
    const guard = guardTeacherAssignmentOwnership(
      ctx,
      ta,
      'simpan perangkat ajar',
    );
    if (!guard.ok) return guard;

    const now = new Date();
    const existingId = input.id ? parseIntId(input.id) : null;
    if (existingId) {
      const [existingRow] = await this.db
        .select()
        .from(schema.teacherDocuments)
        .where(eq(schema.teacherDocuments.id, existingId))
        .limit(1);
      if (existingRow) {
        const domainExisting = {
          id: String(existingRow.id),
          teacher_assignment_id: String(existingRow.teacherAssignmentId),
          template_id: String(existingRow.templateId),
          judul: existingRow.judul,
          konten: existingRow.konten,
          status: existingRow.status,
          generated_prompt: '',
          generated_at: existingRow.generatedAt
            ? toIsoString(existingRow.generatedAt)
            : null,
          pasted_at: existingRow.pastedAt
            ? toIsoString(existingRow.pastedAt)
            : null,
          published_at: existingRow.publishedAt
            ? toIsoString(existingRow.publishedAt)
            : null,
          checklist_state:
            existingRow.validationJson &&
            typeof existingRow.validationJson === 'object'
              ? (existingRow.validationJson as Record<string, boolean>)
              : {},
        };
        const edited = applyTeacherDocumentContentEdit(
          domainExisting,
          String(input.judul),
          String(input.konten),
          now.toISOString(),
        );
        const validationJson =
          input.checklist_state ?? edited.checklist_state;
        await this.db
          .update(schema.teacherDocuments)
          .set({
            judul: edited.judul,
            konten: edited.konten,
            status: edited.status,
            pastedAt: now,
            publishedAt: edited.published_at
              ? new Date(edited.published_at)
              : null,
            validationJson,
          })
          .where(eq(schema.teacherDocuments.id, existingId));

        return {
          ok: true as const,
          value: { ...edited, checklist_state: validationJson },
        };
      }
    }

    const tplId = parseIntId(input.template_id);
    if (!tplId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'prompt_templates',
          id: input.template_id,
          message: 'Template perangkat ajar tidak ditemukan.',
        },
      };
    }

    const checklist = input.checklist_state ?? {};
    const [{ id: newId }] = await this.db
      .insert(schema.teacherDocuments)
      .values({
        teacherAssignmentId: Number(ta!.id),
        templateId: tplId,
        judul: String(input.judul).trim(),
        konten: String(input.konten).trim(),
        status: 'DRAFT',
        generatedAt: now,
        pastedAt: now,
        publishedAt: null,
        validationJson: checklist,
      })
      .$returningId();

    return {
      ok: true as const,
      value: {
        id: String(newId),
        teacher_assignment_id: ta!.id,
        template_id: input.template_id,
        judul: String(input.judul).trim(),
        konten: String(input.konten).trim(),
        status: 'DRAFT' as const,
        generated_prompt: String(input.generated_prompt ?? ''),
        generated_at: now.toISOString(),
        pasted_at: now.toISOString(),
        published_at: null,
        checklist_state: checklist,
      },
    };
  }

  async publishTeacherDocument(
    ctx: AuthContext,
    documentId: string,
    checklistState?: Record<string, boolean>,
  ) {
    const docId = parseIntId(documentId);
    if (!docId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'teacher_documents',
          id: documentId,
          message: 'Dokumen perangkat ajar tidak ditemukan.',
        },
      };
    }
    const [docRow] = await this.db
      .select()
      .from(schema.teacherDocuments)
      .where(eq(schema.teacherDocuments.id, docId))
      .limit(1);
    if (!docRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'teacher_documents',
          id: documentId,
          message: 'Dokumen perangkat ajar tidak ditemukan.',
        },
      };
    }

    const ta = await this.getDomainTaById(String(docRow.teacherAssignmentId));
    const guard = guardTeacherAssignmentOwnership(
      ctx,
      ta,
      'publish perangkat ajar',
    );
    if (!guard.ok) return guard;

    const [tplRow] = await this.db
      .select()
      .from(schema.promptTemplates)
      .where(eq(schema.promptTemplates.id, docRow.templateId))
      .limit(1);
    if (!tplRow) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'prompt_templates',
          id: String(docRow.templateId),
          message: 'Template tidak ditemukan.',
        },
      };
    }

    const mergedChecklist =
      checklistState ??
      (docRow.validationJson && typeof docRow.validationJson === 'object'
        ? (docRow.validationJson as Record<string, boolean>)
        : {});

    const domainDoc = {
      id: String(docRow.id),
      teacher_assignment_id: String(docRow.teacherAssignmentId),
      template_id: String(docRow.templateId),
      judul: docRow.judul,
      konten: docRow.konten,
      status: docRow.status,
      generated_prompt: '',
      generated_at: docRow.generatedAt ? toIsoString(docRow.generatedAt) : null,
      pasted_at: docRow.pastedAt ? toIsoString(docRow.pastedAt) : null,
      published_at: docRow.publishedAt ? toIsoString(docRow.publishedAt) : null,
      checklist_state: mergedChecklist,
    };

    const domainTpl = {
      id: String(tplRow.id),
      kode: tplRow.kode,
      nama: tplRow.nama,
      kategori: tplRow.kategori,
      kurikulum_acuan: tplRow.kurikulumAcuan,
      input_fields: [],
      template_body: tplRow.templateBody,
      output_structure: tplRow.outputStructure,
      validation_checklist: (Array.isArray(tplRow.validationChecklistJson)
        ? tplRow.validationChecklistJson
        : []) as string[],
      version: tplRow.version,
      status: tplRow.status,
    };

    const check = canPublishTeacherDocument(domainDoc, domainTpl);
    if (!check.ok) return check;

    const now = new Date();
    await this.db
      .update(schema.teacherDocuments)
      .set({
        status: 'PUBLISHED',
        publishedAt: now,
        validationJson: mergedChecklist,
      })
      .where(eq(schema.teacherDocuments.id, docId));

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'PUBLISH_TEACHER_DOCUMENT',
      'teacher_documents',
      String(docId),
      `Mempublikasikan perangkat ajar "${docRow.judul}"`,
    );

    return {
      ok: true as const,
      value: {
        ...domainDoc,
        status: 'PUBLISHED' as const,
        published_at: now.toISOString(),
      },
    };
  }

  async createPklJournal(
    ctx: AuthContext,
    input: { placement_id: string; tanggal?: string; aktivitas: string },
  ) {
    if (ctx.activeRole !== 'SISWA' || !ctx.student) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya siswa PKL yang dapat mencatat jurnal.',
        },
      };
    }
    const plcId = parseIntId(input.placement_id);
    if (!plcId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_placements',
          id: input.placement_id,
          message: 'Penempatan PKL tidak ditemukan.',
        },
      };
    }
    const [plc] = await this.db
      .select()
      .from(schema.pklPlacements)
      .where(
        and(
          eq(schema.pklPlacements.id, plcId),
          eq(schema.pklPlacements.studentId, Number(ctx.student.id)),
        ),
      )
      .limit(1);
    if (!plc) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_placements',
          id: input.placement_id,
          message: 'Penempatan PKL tidak ditemukan.',
        },
      };
    }

    const tglStr = input.tanggal || new Date().toISOString().slice(0, 10);
    const [{ id: newId }] = await this.db
      .insert(schema.pklJournals)
      .values({
        placementId: plcId,
        tanggal: new Date(tglStr),
        aktivitas: String(input.aktivitas ?? '').trim(),
        validasiBk: false,
        catatanBk: '',
      })
      .$returningId();

    return {
      ok: true as const,
      value: {
        id: String(newId),
        placement_id: input.placement_id,
        tanggal: tglStr,
        aktivitas: String(input.aktivitas ?? '').trim(),
        validasi_bk: false,
        catatan_bk: '',
      },
    };
  }

  async validatePklJournal(
    ctx: AuthContext,
    journalId: string,
    input: { validasi_bk?: boolean; catatan_bk?: string },
  ) {
    const jid = parseIntId(journalId);
    if (!jid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_journals',
          id: journalId,
          message: 'Jurnal PKL tidak ditemukan.',
        },
      };
    }
    const [journal] = await this.db
      .select()
      .from(schema.pklJournals)
      .where(eq(schema.pklJournals.id, jid))
      .limit(1);
    if (!journal) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_journals',
          id: journalId,
          message: 'Jurnal PKL tidak ditemukan.',
        },
      };
    }
    const [plc] = await this.db
      .select()
      .from(schema.pklPlacements)
      .where(eq(schema.pklPlacements.id, journal.placementId))
      .limit(1);
    const [stu] = plc
      ? await this.db
          .select()
          .from(schema.students)
          .where(eq(schema.students.id, plc.studentId))
          .limit(1)
      : [];
    if (!stu) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'students',
          id: String(plc?.studentId ?? '-'),
          message: 'Siswa PKL tidak ditemukan.',
        },
      };
    }
    const bkAssigns = await this.db.select().from(schema.bkClassAssignments);
    const bkGuard = guardBkRombelAccess(
      ctx,
      String(stu.rombelId),
      bkAssigns.map((b) => ({
        id: String(b.id),
        bk_id: String(b.bkId),
        rombel_id: String(b.rombelId),
      })),
    );
    if (!bkGuard.ok) return bkGuard;

    const validasiBk = Boolean(input.validasi_bk ?? true);
    const catatanBk = String(input.catatan_bk ?? 'Tervalidasi pembimbing BK.');

    await this.db
      .update(schema.pklJournals)
      .set({ validasiBk, catatanBk })
      .where(eq(schema.pklJournals.id, jid));

    return {
      ok: true as const,
      value: {
        id: String(journal.id),
        placement_id: String(journal.placementId),
        tanggal: toIsoDateOnly(journal.tanggal),
        aktivitas: journal.aktivitas,
        validasi_bk: validasiBk,
        catatan_bk: catatanBk,
      },
    };
  }

  async upsertPklScore(
    ctx: AuthContext,
    input: { placement_id: string; komponen: PklScoreComponent; nilai: number },
  ) {
    const plcId = parseIntId(input.placement_id);
    if (!plcId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_placements',
          id: input.placement_id,
          message: 'Penempatan PKL tidak ditemukan.',
        },
      };
    }
    const [plc] = await this.db
      .select()
      .from(schema.pklPlacements)
      .where(eq(schema.pklPlacements.id, plcId))
      .limit(1);
    if (!plc) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'pkl_placements',
          id: input.placement_id,
          message: 'Penempatan PKL tidak ditemukan.',
        },
      };
    }
    const [stu] = await this.db
      .select()
      .from(schema.students)
      .where(eq(schema.students.id, plc.studentId))
      .limit(1);
    if (!stu) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'students',
          id: String(plc.studentId),
          message: 'Siswa PKL tidak ditemukan.',
        },
      };
    }
    const bkAssigns = await this.db.select().from(schema.bkClassAssignments);
    const bkGuard = guardBkRombelAccess(
      ctx,
      String(stu.rombelId),
      bkAssigns.map((b) => ({
        id: String(b.id),
        bk_id: String(b.bkId),
        rombel_id: String(b.rombelId),
      })),
    );
    if (!bkGuard.ok) return bkGuard;

    const [existing] = await this.db
      .select()
      .from(schema.pklScores)
      .where(
        and(
          eq(schema.pklScores.placementId, plcId),
          eq(schema.pklScores.komponen, input.komponen),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(schema.pklScores)
        .set({
          nilai: Number(input.nilai).toFixed(2),
          dinilaiOleh: Number(ctx.user.id),
        })
        .where(eq(schema.pklScores.id, existing.id));
      return {
        ok: true as const,
        value: {
          id: String(existing.id),
          placement_id: input.placement_id,
          komponen: input.komponen,
          nilai: Number(input.nilai),
          dinilai_oleh: ctx.user.id,
        },
      };
    }

    const [{ id: newId }] = await this.db
      .insert(schema.pklScores)
      .values({
        placementId: plcId,
        komponen: input.komponen,
        nilai: Number(input.nilai).toFixed(2),
        dinilaiOleh: Number(ctx.user.id),
      })
      .$returningId();

    return {
      ok: true as const,
      value: {
        id: String(newId),
        placement_id: input.placement_id,
        komponen: input.komponen,
        nilai: Number(input.nilai),
        dinilai_oleh: ctx.user.id,
      },
    };
  }

  async sendNotification(
    ctx: AuthContext,
    input: {
      user_id: string;
      tipe?: 'INFO' | 'PERINGATAN' | 'AKADEMIK' | 'PEMBINAAN';
      judul: string;
      pesan: string;
      entitas_id?: string;
    },
  ) {
    if (
      ctx.activeRole !== 'WAKASEK' &&
      ctx.activeRole !== 'KEPALA_SEKOLAH' &&
      ctx.activeRole !== 'ADMIN' &&
      ctx.activeRole !== 'GURU_BK'
    ) {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Peran Anda tidak diizinkan mengirim notifikasi berjenjang.',
        },
      };
    }
    const targetUid = parseIntId(input.user_id);
    if (!targetUid) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'users',
          id: input.user_id,
          message: 'Pengguna tujuan tidak ditemukan.',
        },
      };
    }

    const tipe = input.tipe || ('PERINGATAN' as const);
    const [{ id: newId }] = await this.db
      .insert(schema.notifications)
      .values({
        userId: targetUid,
        tipe,
        judul: String(input.judul).trim(),
        pesan: String(input.pesan).trim(),
        entitas: 'teacher_documents',
        entitasId: String(input.entitas_id ?? ''),
      })
      .$returningId();

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'SEND_NOTIFICATION',
      'notifications',
      String(newId),
      `Mengirim notifikasi "${String(input.judul).trim()}" ke ${input.user_id}`,
    );

    return {
      ok: true as const,
      value: {
        id: String(newId),
        user_id: input.user_id,
        tipe,
        judul: String(input.judul).trim(),
        pesan: String(input.pesan).trim(),
        entitas: 'teacher_documents',
        entitas_id: String(input.entitas_id ?? ''),
        dibaca_at: null,
        created_at: new Date().toISOString(),
      },
    };
  }

  async createCoachingNote(
    ctx: AuthContext,
    input: {
      target_type: 'SISWA' | 'GURU';
      target_id: string;
      judul: string;
      catatan: string;
    },
  ) {
    const targetId = parseIntId(input.target_id);
    if (!targetId) {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'target_id',
          message: 'Target pembinaan tidak valid.',
        },
      };
    }
    const targetType = input.target_type || ('SISWA' as const);
    const [{ id: newId }] = await this.db
      .insert(schema.coachingNotes)
      .values({
        authorUserId: Number(ctx.user.id),
        targetType,
        targetId,
        judul: String(input.judul).trim(),
        catatan: String(input.catatan).trim(),
      })
      .$returningId();

    return {
      ok: true as const,
      value: {
        id: String(newId),
        author_user_id: ctx.user.id,
        target_type: targetType,
        target_id: input.target_id,
        judul: String(input.judul).trim(),
        catatan: String(input.catatan).trim(),
        created_at: new Date().toISOString(),
      },
    };
  }

  async upsertWalikelasNote(
    ctx: AuthContext,
    input: { student_id: string; catatan: string },
  ) {
    if (ctx.activeRole !== 'WALI_KELAS') {
      return {
        ok: false as const,
        error: {
          kind: 'FORBIDDEN' as const,
          httpStatus: 403 as const,
          message: 'Hanya Wali Kelas yang dapat menulis catatan wali kelas.',
        },
      };
    }
    const stuId = parseIntId(input.student_id);
    if (!stuId) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'students',
          id: input.student_id,
          message: 'Siswa tidak ditemukan.',
        },
      };
    }
    const catatan = String(input.catatan ?? '');
    await this.db
      .insert(schema.walikelasNotes)
      .values({ studentId: stuId, catatan })
      .onDuplicateKeyUpdate({ set: { catatan } });

    return { ok: true as const, value: undefined };
  }

  async previewImport(
    ctx: AuthContext,
    input: { tipe: 'SISWA' | 'GURU'; csv_text: string },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Preview Import');
    if (!adminCheck.ok) return adminCheck;

    const full = await this.loadFullState();
    if (input.tipe === 'GURU') {
      return previewTeacherImportCsv({
        csvText: String(input.csv_text ?? ''),
        existingTeachers: full.teachers,
      });
    }
    return previewStudentImportCsv({
      csvText: String(input.csv_text ?? ''),
      existingStudents: full.students,
      rombels: full.rombels,
      majors: full.majors,
    });
  }

  async commitStudentImport(
    ctx: AuthContext,
    input: { tipe: string; filename?: string; csv_text: string },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Commit Import');
    if (!adminCheck.ok) return adminCheck;

    if (input.tipe !== 'SISWA') {
      return {
        ok: false as const,
        error: {
          kind: 'VALIDATION_ERROR' as const,
          httpStatus: 422 as const,
          field: 'tipe',
          message: 'Tipe import belum didukung pada endpoint ini.',
        },
      };
    }

    return this.db.transaction(async (tx) => {
      const [stuRows, romRows, majRows] = await Promise.all([
        tx.select().from(schema.students),
        tx.select().from(schema.rombels),
        tx.select().from(schema.majors),
      ]);

      const previewRes = previewStudentImportCsv({
        csvText: String(input.csv_text ?? ''),
        existingStudents: stuRows.map((s) => ({
          id: String(s.id),
          user_id: String(s.userId),
          nisn: s.nisn,
          nis: s.nis,
          rombel_id: String(s.rombelId),
          jenis_kelamin: s.jenisKelamin,
          tanggal_lahir: toIsoDateOnly(s.tanggalLahir),
          status: s.status,
        })),
        rombels: romRows.map((r) => ({
          id: String(r.id),
          tingkat: r.tingkat as 10 | 11 | 12,
          major_id: String(r.majorId),
          academic_year_id: String(r.academicYearId),
          kurikulum_acuan: r.kurikulumAcuan,
          nama_rombel: r.namaRombel,
          wali_kelas_id: r.waliKelasTeacherId
            ? String(r.waliKelasTeacherId)
            : null,
        })),
        majors: majRows.map((m) => ({
          id: String(m.id),
          kode: m.kode,
          nama: m.nama,
        })),
      });
      if (!previewRes.ok) return previewRes;

      for (const row of previewRes.value.validRows) {
        const [{ id: newUserId }] = await tx
          .insert(schema.users)
          .values({
            nama: row.nama,
            email: `${row.nisn}@siswa.smkn1percut.sch.id`,
            passwordHash: 'demo:smkn1percut',
            role: 'SISWA',
            status: 'AKTIF',
          })
          .$returningId();

        await tx
          .insert(schema.userRoles)
          .values({ userId: newUserId, role: 'SISWA' });

        await tx.insert(schema.students).values({
          userId: newUserId,
          nisn: row.nisn,
          nis: row.nis,
          rombelId: Number(row.rombelId),
          jenisKelamin: row.jenisKelamin,
          tanggalLahir: new Date('2008-01-01'),
          status: 'AKTIF',
        });
      }

      const filename = String(input.filename || 'import_siswa.csv');
      const status =
        previewRes.value.errorRows.length > 0
          ? ('SEBAGIAN_ERROR' as const)
          : ('SELESAI' as const);
      const errorLogs = previewRes.value.errorRows.map((e) => ({
        row: e.row,
        reason: e.reason,
      }));

      const [{ id: batchId }] = await tx
        .insert(schema.importBatches)
        .values({
          tipe: 'SISWA',
          fileUrl: filename,
          status,
          totalBaris: previewRes.value.totalRows,
          barisSukses: previewRes.value.validRows.length,
          barisError: previewRes.value.errorRows.length,
          errorLogJson: errorLogs,
          createdBy: Number(ctx.user.id),
        })
        .$returningId();

      await this.insertAudit(
        tx,
        Number(ctx.user.id),
        'IMPORT_STUDENTS',
        'import_batches',
        String(batchId),
        `Import siswa: ${previewRes.value.validRows.length} masuk, ${previewRes.value.errorRows.length} error`,
      );

      return {
        ok: true as const,
        value: {
          batch: {
            id: String(batchId),
            tipe: 'SISWA' as const,
            filename,
            status,
            total_baris: previewRes.value.totalRows,
            baris_sukses: previewRes.value.validRows.length,
            baris_error: previewRes.value.errorRows.length,
            error_logs: errorLogs,
            created_by: ctx.user.id,
            created_at: new Date().toISOString(),
          },
          preview: previewRes.value,
        },
      };
    });
  }

  async updateEraporMapping(
    ctx: AuthContext,
    input: { template_name?: string; mapping: EraporColumnMapping['mapping'] },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Update Mapping e-Rapor');
    if (!adminCheck.ok) return adminCheck;

    const [first] = await this.db
      .select()
      .from(schema.eraporColumnMappings)
      .limit(1);
    if (!first) {
      return {
        ok: false as const,
        error: {
          kind: 'NOT_FOUND' as const,
          httpStatus: 404 as const,
          entity: 'erapor_column_mappings',
          id: '1',
          message: 'Mapping e-Rapor belum diinisialisasi.',
        },
      };
    }

    const nextName = String(input.template_name || first.templateName);
    await this.db
      .update(schema.eraporColumnMappings)
      .set({ templateName: nextName, mappingJson: input.mapping })
      .where(eq(schema.eraporColumnMappings.id, first.id));

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'UPDATE_ERAPOR_MAPPING',
      'erapor_mappings',
      String(first.id),
      `Memperbarui mapping e-Rapor (${input.mapping.length} kolom)`,
    );

    return {
      ok: true as const,
      value: {
        id: String(first.id),
        academic_year_id: String(first.academicYearId),
        mapel_id: first.mapelId ? String(first.mapelId) : null,
        template_name: nextName,
        mapping: input.mapping,
        created_by: String(first.createdBy),
      },
    };
  }

  async recordBackupRun(
    ctx: AuthContext,
    input: { simulate_zero_byte?: boolean },
  ) {
    const adminCheck = guardAdminOnly(ctx, 'Jalankan Backup Manual');
    if (!adminCheck.ok) return adminCheck;

    const diskFiles = listDiskBackupFiles();
    if (!input.simulate_zero_byte && diskFiles.length > 0) {
      const latest = diskFiles[0];
      await this.insertAudit(
        this.db,
        Number(ctx.user.id),
        'VERIFY_BACKUP_DISK',
        'backup_history',
        latest.id,
        `Verifikasi backup nyata di disk: ${latest.filename} (${latest.size_bytes} bytes) status=${latest.status}`,
      );
      return { ok: true as const, value: latest };
    }

    const counts = await this.getHealthCounts();
    const simulateZero = Boolean(input.simulate_zero_byte);
    const sizeBytes = simulateZero ? 0 : Math.max(4096, counts.students * 2048);
    const filename = `lms_smkn1percut_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now().toString().slice(-4)}.sql.gz`;
    const record = {
      id: `bkp-${Date.now()}`,
      filename,
      size_bytes: sizeBytes,
      status: sizeBytes === 0 ? ('EMPTY_ALERT' as const) : ('OK' as const),
      created_at: new Date().toISOString(),
    };

    if (sizeBytes === 0) {
      await this.db.insert(schema.notifications).values({
        userId: Number(ctx.user.id),
        tipe: 'PERINGATAN',
        judul: 'ALERT BACKUP 0 BYTE',
        pesan: `Verifikasi backup gagal: file ${filename} berukuran 0 byte! Segera periksa disk server / container backup.`,
        entitas: 'backup_history',
        entitasId: record.id,
      });
    }

    await this.insertAudit(
      this.db,
      Number(ctx.user.id),
      'RUN_BACKUP',
      'backup_history',
      record.id,
      `Backup ${filename} (${sizeBytes} bytes) status=${record.status}`,
    );

    return { ok: true as const, value: record };
  }

  async resetDemoState(): Promise<void> {
    throw new Error(
      'Reset data demo dilarang pada mode database MySQL produksi.',
    );
  }
}
