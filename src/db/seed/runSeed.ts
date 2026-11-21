import 'dotenv/config';
import { getMysqlDb } from '../index';
import * as schema from '../schema/index';
import { buildRealisticSeedState } from './realisticSeed';
import { eq, sql } from 'drizzle-orm';

/**
 * Idempotent MySQL 8 CLI Seeder (`npm run db:seed`).
 * Populates 14 majors, 18 rombels, 180 students, 20 teachers (3 math teachers),
 * 5 BK counselors, starter sessions, modules, tasks, grades, e-Rapor mapping,
 * CBT banks/exams, 10 PKL placements, and prompt templates.
 */
async function runSeed() {
  const db = getMysqlDb();
  if (!db) {
    console.error('[seed] DATABASE_URL belum dikonfigurasi. Lewati seed MySQL.');
    process.exit(1);
  }

  const seed = buildRealisticSeedState();

  await db
    .insert(schema.schools)
    .values({
      npsn: seed.school.npsn,
      nama: seed.school.nama,
      alamat: seed.school.alamat,
      kepalaSekolah: seed.school.kepala_sekolah,
      telepon: seed.school.telepon,
      email: seed.school.email,
      logoUrl: seed.school.logo_url,
    })
    .onDuplicateKeyUpdate({ set: { nama: seed.school.nama } });

  for (const cur of [
    { kode: 'K13' as const, deskripsi: 'Kurikulum 2013 Revisi (KI/KD)' },
    { kode: 'MERDEKA' as const, deskripsi: 'Kurikulum Merdeka (CP/TP/ATP/KKTP)' },
  ]) {
    await db
      .insert(schema.curricula)
      .values(cur)
      .onDuplicateKeyUpdate({ set: { deskripsi: cur.deskripsi } });
  }

  for (const ay of seed.academic_years) {
    await db
      .insert(schema.academicYears)
      .values({
        tahunAjaran: ay.tahun_ajaran,
        semester: ay.semester,
        tanggalMulai: new Date(ay.tanggal_mulai),
        tanggalSelesai: new Date(ay.tanggal_selesai),
        isActive: ay.is_active,
      })
      .onDuplicateKeyUpdate({ set: { isActive: ay.is_active } });
  }

  const [activeYearRow] = await db
    .select()
    .from(schema.academicYears)
    .where(eq(schema.academicYears.isActive, true));

  const majorIdMap = new Map<string, number>();
  for (const m of seed.majors) {
    await db
      .insert(schema.majors)
      .values({ kode: m.kode, nama: m.nama })
      .onDuplicateKeyUpdate({ set: { nama: m.nama } });
    const [row] = await db
      .select()
      .from(schema.majors)
      .where(eq(schema.majors.kode, m.kode));
    if (row) majorIdMap.set(m.id, row.id);
  }

  const rombelIdMap = new Map<string, number>();
  for (const r of seed.rombels) {
    const majDbId = majorIdMap.get(r.major_id)!;
    await db
      .insert(schema.rombels)
      .values({
        tingkat: r.tingkat,
        majorId: majDbId,
        academicYearId: activeYearRow.id,
        kurikulumAcuan: r.kurikulum_acuan,
        namaRombel: r.nama_rombel,
      })
      .onDuplicateKeyUpdate({ set: { kurikulumAcuan: r.kurikulum_acuan } });
    const [row] = await db
      .select()
      .from(schema.rombels)
      .where(eq(schema.rombels.namaRombel, r.nama_rombel));
    if (row) rombelIdMap.set(r.id, row.id);
  }

  const userIdMap = new Map<string, number>();
  for (const u of seed.users) {
    await db
      .insert(schema.users)
      .values({
        nama: u.nama,
        email: u.email,
        passwordHash: 'demo:smkn1percut',
        role: u.roles[0],
        status: u.status,
      })
      .onDuplicateKeyUpdate({ set: { nama: u.nama } });
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, u.email));
    if (row) {
      userIdMap.set(u.id, row.id);
      for (const role of u.roles) {
        await db
          .insert(schema.userRoles)
          .values({ userId: row.id, role })
          .onDuplicateKeyUpdate({ set: { role } });
      }
    }
  }

  const teacherIdMap = new Map<string, number>();
  for (const t of seed.teachers) {
    const uid = userIdMap.get(t.user_id)!;
    await db
      .insert(schema.teachers)
      .values({
        userId: uid,
        nuptk: t.nuptk,
        nip: t.nip,
        bidang: t.bidang,
      })
      .onDuplicateKeyUpdate({ set: { bidang: t.bidang } });
    const [row] = await db
      .select()
      .from(schema.teachers)
      .where(eq(schema.teachers.nuptk, t.nuptk));
    if (row) teacherIdMap.set(t.id, row.id);
  }

  // Wire Wali Kelas assignment on rombels
  for (const r of seed.rombels) {
    if (r.wali_kelas_id) {
      const rDbId = rombelIdMap.get(r.id);
      const tDbId = teacherIdMap.get(r.wali_kelas_id);
      if (rDbId && tDbId) {
        await db
          .update(schema.rombels)
          .set({ waliKelasTeacherId: tDbId })
          .where(eq(schema.rombels.id, rDbId));
      }
    }
  }

  const studentIdMap = new Map<string, number>();
  for (const s of seed.students) {
    const uid = userIdMap.get(s.user_id)!;
    const rid = rombelIdMap.get(s.rombel_id)!;
    await db
      .insert(schema.students)
      .values({
        userId: uid,
        nisn: s.nisn,
        nis: s.nis,
        rombelId: rid,
        jenisKelamin: s.jenis_kelamin,
        tanggalLahir: new Date(s.tanggal_lahir),
        status: s.status,
      })
      .onDuplicateKeyUpdate({ set: { rombelId: rid, status: s.status } });
    const [row] = await db
      .select()
      .from(schema.students)
      .where(eq(schema.students.nisn, s.nisn));
    if (row) studentIdMap.set(s.id, row.id);
  }

  const bkIdMap = new Map<string, number>();
  for (const bk of seed.bk_counselors) {
    const uid = userIdMap.get(bk.user_id)!;
    await db
      .insert(schema.bkCounselors)
      .values({ userId: uid })
      .onDuplicateKeyUpdate({ set: { userId: uid } });
    const [row] = await db
      .select()
      .from(schema.bkCounselors)
      .where(eq(schema.bkCounselors.userId, uid));
    if (row) bkIdMap.set(bk.id, row.id);
  }

  for (const bka of seed.bk_class_assignments) {
    const bkDbId = bkIdMap.get(bka.bk_id)!;
    const rDbId = rombelIdMap.get(bka.rombel_id)!;
    await db
      .insert(schema.bkClassAssignments)
      .values({ bkId: bkDbId, rombelId: rDbId })
      .onDuplicateKeyUpdate({ set: { rombelId: rDbId } });
  }

  const subjectIdMap = new Map<string, number>();
  for (const sub of seed.subjects) {
    await db
      .insert(schema.subjects)
      .values({ kode: sub.kode, nama: sub.nama, kelompok: sub.kelompok })
      .onDuplicateKeyUpdate({ set: { nama: sub.nama } });
    const [row] = await db
      .select()
      .from(schema.subjects)
      .where(eq(schema.subjects.kode, sub.kode));
    if (row) subjectIdMap.set(sub.id, row.id);
  }

  const taIdMap = new Map<string, number>();
  for (const ta of seed.teacher_assignments) {
    const tId = teacherIdMap.get(ta.teacher_id)!;
    const sId = subjectIdMap.get(ta.subject_id)!;
    const rId = rombelIdMap.get(ta.rombel_id)!;
    await db
      .insert(schema.teacherAssignments)
      .values({
        teacherId: tId,
        subjectId: sId,
        rombelId: rId,
        academicYearId: activeYearRow.id,
        semester: ta.semester,
        kurikulumAcuan: ta.kurikulum_acuan,
        jamPerMinggu: ta.jam_per_minggu,
        status: ta.status,
      })
      .onDuplicateKeyUpdate({ set: { jamPerMinggu: ta.jam_per_minggu } });
  }
  const allTaRows = await db.select().from(schema.teacherAssignments);
  for (const ta of seed.teacher_assignments) {
    const tId = teacherIdMap.get(ta.teacher_id);
    const sId = subjectIdMap.get(ta.subject_id);
    const rId = rombelIdMap.get(ta.rombel_id);
    const matched = allTaRows.find(
      (row) =>
        row.teacherId === tId && row.subjectId === sId && row.rombelId === rId,
    );
    if (matched) taIdMap.set(ta.id, matched.id);
  }

  const tplIdMap = new Map<string, number>();
  for (const tpl of seed.prompt_templates) {
    await db
      .insert(schema.promptTemplates)
      .values({
        kode: tpl.kode,
        nama: tpl.nama,
        kategori: tpl.kategori,
        kurikulumAcuan: tpl.kurikulum_acuan,
        inputSchemaJson: tpl.input_fields,
        templateBody: tpl.template_body,
        outputStructure: tpl.output_structure,
        validationChecklistJson: tpl.validation_checklist,
        version: tpl.version,
        status: tpl.status,
      })
      .onDuplicateKeyUpdate({ set: { version: tpl.version } });
    const [row] = await db
      .select()
      .from(schema.promptTemplates)
      .where(eq(schema.promptTemplates.kode, tpl.kode));
    if (row) tplIdMap.set(tpl.id, row.id);
  }

  // Seed starter learning content only when tables are empty (idempotent)
  const [{ c: modCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.modules);
  if (Number(modCount) === 0) {
    const modIdMap = new Map<string, number>();
    for (const m of seed.modules) {
      const taDbId = taIdMap.get(m.teacher_assignment_id);
      if (!taDbId) continue;
      const [{ id }] = await db
        .insert(schema.modules)
        .values({
          teacherAssignmentId: taDbId,
          judul: m.judul,
          konten: m.konten,
          status: m.status,
          clonedFrom: null,
        })
        .$returningId();
      modIdMap.set(m.id, id);
    }

    const sesIdMap = new Map<string, number>();
    for (const s of seed.sessions) {
      const taDbId = taIdMap.get(s.teacher_assignment_id);
      if (!taDbId) continue;
      const [{ id }] = await db
        .insert(schema.sessions)
        .values({
          teacherAssignmentId: taDbId,
          pertemuanKe: s.pertemuan_ke,
          tanggal: new Date(s.tanggal),
          jamMulai: s.jam_mulai,
          jamSelesai: s.jam_selesai,
          tipeSesi: s.tipe_sesi,
          topik: s.topik,
          moduleId: s.module_id ? modIdMap.get(s.module_id) ?? null : null,
          minimumReadPct: s.minimum_read_pct,
          status: s.status,
        })
        .$returningId();
      sesIdMap.set(s.id, id);
    }

    for (const att of seed.attendance_records) {
      const sesDbId = sesIdMap.get(att.session_id);
      const stuDbId = studentIdMap.get(att.student_id);
      if (!sesDbId || !stuDbId) continue;
      await db.insert(schema.attendanceRecords).values({
        sessionId: sesDbId,
        studentId: stuDbId,
        status: att.status,
        aktivitasMinimumTerpenuhi: att.aktivitas_minimum_terpenuhi,
        readPct: att.read_pct,
        submittedTask: att.submitted_task,
        submittedReflection: att.submitted_reflection,
        diaksesPada: att.diakses_pada ? new Date(att.diakses_pada) : null,
        diaktifkanPada: att.diaktifkan_pada ? new Date(att.diaktifkan_pada) : null,
        overrideOleh: att.override_oleh ? userIdMap.get(att.override_oleh) ?? null : null,
        alasanOverride: att.alasan_override,
      });
    }

    const taskIdMap = new Map<string, number>();
    for (const t of seed.assignments) {
      const taDbId = taIdMap.get(t.teacher_assignment_id);
      if (!taDbId) continue;
      const [{ id }] = await db
        .insert(schema.assignments)
        .values({
          sessionId: t.session_id ? sesIdMap.get(t.session_id) ?? null : null,
          teacherAssignmentId: taDbId,
          judul: t.judul,
          deskripsi: t.deskripsi,
          deadline: new Date(t.deadline),
          tipe: t.tipe,
          rubrik: t.rubrik,
          clonedFrom: null,
        })
        .$returningId();
      taskIdMap.set(t.id, id);
    }

    for (const sub of seed.submissions) {
      const aId = taskIdMap.get(sub.assignment_id);
      const sId = studentIdMap.get(sub.student_id);
      if (!aId || !sId) continue;
      await db.insert(schema.submissions).values({
        assignmentId: aId,
        studentId: sId,
        fileUrl: sub.file_url,
        teks: sub.teks,
        submittedAt: new Date(sub.submitted_at),
        nilai: sub.nilai !== null ? sub.nilai.toFixed(2) : null,
        dinilaiOleh: sub.dinilai_oleh ? teacherIdMap.get(sub.dinilai_oleh) ?? null : null,
        catatanGuru: sub.catatan_guru,
      });
    }
  }

  const [{ c: nbCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.notebooks);
  if (Number(nbCount) === 0) {
    const nbIdMap = new Map<string, number>();
    for (const nb of seed.notebooks) {
      const sId = studentIdMap.get(nb.student_id);
      const subId = subjectIdMap.get(nb.subject_id);
      const taId = taIdMap.get(nb.teacher_assignment_id);
      if (!sId || !subId || !taId) continue;
      const [{ id }] = await db
        .insert(schema.notebooks)
        .values({ studentId: sId, subjectId: subId, teacherAssignmentId: taId })
        .$returningId();
      nbIdMap.set(nb.id, id);
    }
    for (const entry of seed.notebook_entries) {
      const nbDbId = nbIdMap.get(entry.notebook_id);
      if (!nbDbId) continue;
      await db.insert(schema.notebookEntries).values({
        notebookId: nbDbId,
        judul: entry.judul,
        konten: entry.konten,
        gambarUrl: entry.gambar_url,
        komentarGuru: entry.komentar_guru,
      });
    }
  }

  const [{ c: gcCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.gradeComponents);
  if (Number(gcCount) === 0) {
    const gcIdMap = new Map<string, number>();
    for (const gc of seed.grade_components) {
      const taId = taIdMap.get(gc.teacher_assignment_id);
      if (!taId) continue;
      const [{ id }] = await db
        .insert(schema.gradeComponents)
        .values({
          teacherAssignmentId: taId,
          nama: gc.nama,
          bobot: gc.bobot.toFixed(2),
        })
        .$returningId();
      gcIdMap.set(gc.id, id);
    }
    for (const g of seed.grades) {
      const sId = studentIdMap.get(g.student_id);
      const taId = taIdMap.get(g.teacher_assignment_id);
      const cId = gcIdMap.get(g.component_id);
      if (!sId || !taId || !cId) continue;
      await db.insert(schema.grades).values({
        studentId: sId,
        teacherAssignmentId: taId,
        componentId: cId,
        nilai: g.nilai.toFixed(2),
        catatan: g.catatan,
      });
    }
  }

  const [{ c: ermCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.eraporColumnMappings);
  if (Number(ermCount) === 0) {
    for (const erm of seed.erapor_mappings) {
      const adminId = userIdMap.get(erm.created_by) ?? Array.from(userIdMap.values())[0];
      await db.insert(schema.eraporColumnMappings).values({
        academicYearId: activeYearRow.id,
        mapelId: null,
        templateName: erm.template_name,
        mappingJson: erm.mapping,
        createdBy: adminId,
      });
    }
  }

  const [{ c: examCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.exams);
  if (Number(examCount) === 0) {
    const qbIdMap = new Map<string, number>();
    for (const qb of seed.question_banks) {
      const subId = subjectIdMap.get(qb.subject_id);
      const tId = teacherIdMap.get(qb.teacher_id);
      if (!subId || !tId) continue;
      const [{ id }] = await db
        .insert(schema.questionBanks)
        .values({
          subjectId: subId,
          teacherId: tId,
          judul: qb.judul,
          kurikulumAcuan: qb.kurikulum_acuan,
        })
        .$returningId();
      qbIdMap.set(qb.id, id);
    }

    const qIdMap = new Map<string, number>();
    for (const q of seed.questions) {
      const bId = qbIdMap.get(q.bank_id);
      if (!bId) continue;
      const [{ id }] = await db
        .insert(schema.questions)
        .values({
          bankId: bId,
          tipe: q.tipe,
          stem: q.stem,
          optionsJson: q.options,
          jawabanJson: q.jawaban,
          rubrik: q.rubrik,
          skor: q.skor.toFixed(2),
          levelKognitif: q.level_kognitif,
        })
        .$returningId();
      qIdMap.set(q.id, id);
    }

    const exIdMap = new Map<string, number>();
    for (const ex of seed.exams) {
      const taId = taIdMap.get(ex.teacher_assignment_id);
      if (!taId) continue;
      const [{ id }] = await db
        .insert(schema.exams)
        .values({
          teacherAssignmentId: taId,
          tipe: ex.tipe,
          judul: ex.judul,
          waktuMulai: new Date(ex.waktu_mulai),
          durasiMenit: ex.durasi_menit,
          token: ex.token,
          status: ex.status,
          parentExamId: null,
        })
        .$returningId();
      exIdMap.set(ex.id, id);
    }

    const exsIdMap = new Map<string, number>();
    for (const es of seed.exam_sessions) {
      const eId = exIdMap.get(es.exam_id);
      const sId = studentIdMap.get(es.student_id);
      if (!eId || !sId) continue;
      const [{ id }] = await db
        .insert(schema.examSessions)
        .values({
          examId: eId,
          studentId: sId,
          status: es.status,
          startedAt: es.started_at ? new Date(es.started_at) : null,
          finishedAt: es.finished_at ? new Date(es.finished_at) : null,
          tabSwitchCount: es.tab_switch_count,
        })
        .$returningId();
      exsIdMap.set(es.id, id);
    }

    for (const ea of seed.exam_answers) {
      const esId = exsIdMap.get(ea.exam_session_id);
      const qId = qIdMap.get(ea.question_id);
      if (!esId || !qId) continue;
      await db.insert(schema.examAnswers).values({
        examSessionId: esId,
        questionId: qId,
        jawabanJson: ea.jawaban,
        skor: ea.skor !== null ? ea.skor.toFixed(2) : null,
      });
    }
  }

  const [{ c: pklCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.pklPlacements);
  if (Number(pklCount) === 0) {
    const dudiIdMap = new Map<string, number>();
    for (const d of seed.dudis) {
      const [{ id }] = await db
        .insert(schema.dudis)
        .values({
          nama: d.nama,
          alamat: d.alamat,
          bidang: d.bidang,
          kontak: d.kontak,
        })
        .$returningId();
      dudiIdMap.set(d.id, id);
    }
    const pksIdMap = new Map<string, number>();
    for (const pks of seed.pks_documents) {
      const dId = dudiIdMap.get(pks.dudi_id);
      if (!dId) continue;
      const [{ id }] = await db
        .insert(schema.pksDocuments)
        .values({
          dudiId: dId,
          nomor: pks.nomor,
          tanggalMulai: new Date(pks.tanggal_mulai),
          tanggalSelesai: new Date(pks.tanggal_selesai),
          fileUrl: pks.file_url,
        })
        .$returningId();
      pksIdMap.set(pks.id, id);
    }
    const plcIdMap = new Map<string, number>();
    for (const plc of seed.pkl_placements) {
      const sId = studentIdMap.get(plc.student_id);
      const dId = dudiIdMap.get(plc.dudi_id);
      const pksId = pksIdMap.get(plc.pks_id);
      const bkId = bkIdMap.get(plc.pembimbing_bk_id);
      if (!sId || !dId || !pksId || !bkId) continue;
      const [{ id }] = await db
        .insert(schema.pklPlacements)
        .values({
          studentId: sId,
          dudiId: dId,
          pksId,
          pembimbingBkId: bkId,
          pembimbingDudiNama: plc.pembimbing_dudi_nama,
          periodeMulai: new Date(plc.periode_mulai),
          periodeSelesai: new Date(plc.periode_selesai),
          status: plc.status,
        })
        .$returningId();
      plcIdMap.set(plc.id, id);
    }
    for (const j of seed.pkl_journals) {
      const pId = plcIdMap.get(j.placement_id);
      if (!pId) continue;
      await db.insert(schema.pklJournals).values({
        placementId: pId,
        tanggal: new Date(j.tanggal),
        aktivitas: j.aktivitas,
        validasiBk: j.validasi_bk,
        catatanBk: j.catatan_bk,
      });
    }
    for (const sc of seed.pkl_scores) {
      const pId = plcIdMap.get(sc.placement_id);
      const uId = userIdMap.get(sc.dinilai_oleh);
      if (!pId || !uId) continue;
      await db.insert(schema.pklScores).values({
        placementId: pId,
        komponen: sc.komponen,
        nilai: sc.nilai.toFixed(2),
        dinilaiOleh: uId,
      });
    }
    for (const mc of seed.mapel_pkl_contributions) {
      const sId = studentIdMap.get(mc.student_id);
      const subId = subjectIdMap.get(mc.subject_id);
      const gId = teacherIdMap.get(mc.guru_id);
      if (!sId || !subId || !gId) continue;
      await db.insert(schema.mapelPklContributions).values({
        studentId: sId,
        subjectId: subId,
        nilai: mc.nilai.toFixed(2),
        guruId: gId,
        catatan: mc.catatan,
      });
    }
  }

  const [{ c: docCount }] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(schema.teacherDocuments);
  if (Number(docCount) === 0) {
    for (const doc of seed.teacher_documents) {
      const taId = taIdMap.get(doc.teacher_assignment_id);
      const tplId = tplIdMap.get(doc.template_id);
      if (!taId || !tplId) continue;
      await db.insert(schema.teacherDocuments).values({
        teacherAssignmentId: taId,
        templateId: tplId,
        judul: doc.judul,
        konten: doc.konten,
        status: doc.status,
        generatedAt: doc.generated_at ? new Date(doc.generated_at) : null,
        pastedAt: doc.pasted_at ? new Date(doc.pasted_at) : null,
        publishedAt: doc.published_at ? new Date(doc.published_at) : null,
        validationJson: doc.checklist_state,
      });
    }
    for (const n of seed.notifications) {
      const uId = userIdMap.get(n.user_id);
      if (!uId) continue;
      await db.insert(schema.notifications).values({
        userId: uId,
        tipe: n.tipe,
        judul: n.judul,
        pesan: n.pesan,
        entitas: n.entitas,
        entitasId: n.entitas_id,
      });
    }
    for (const cn of seed.coaching_notes) {
      const aId = userIdMap.get(cn.author_user_id);
      const targetId =
        cn.target_type === 'SISWA'
          ? studentIdMap.get(cn.target_id)
          : teacherIdMap.get(cn.target_id);
      if (!aId || !targetId) continue;
      await db.insert(schema.coachingNotes).values({
        authorUserId: aId,
        targetType: cn.target_type,
        targetId,
        judul: cn.judul,
        catatan: cn.catatan,
      });
    }
    for (const [stuKey, catatan] of Object.entries(seed.walikelas_notes)) {
      const sId = studentIdMap.get(stuKey);
      if (!sId) continue;
      await db
        .insert(schema.walikelasNotes)
        .values({ studentId: sId, catatan })
        .onDuplicateKeyUpdate({ set: { catatan } });
    }
  }

  console.log(
    `[seed] Selesai: ${seed.majors.length} jurusan, ${seed.rombels.length} rombel, ${seed.students.length} siswa, ${seed.teachers.length} guru, ${seed.bk_counselors.length} BK, seluruh modul/sesi/nilai/CBT/PKL siap.`,
  );
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('[seed] Gagal menjalankan seed:', err);
  process.exit(1);
});
