import {
  LmsDatabaseState,
  PklPlacement,
  PklScore,
  Rombel,
  Student,
  Teacher,
  TeacherAssignment,
  User,
} from '../../domain/types';

const FIRST_NAMES_L = [
  'Rizky',
  'Dimas',
  'Bagas',
  'Fadli',
  'Ilham',
  'Arif',
  'Reza',
  'Yoga',
  'Hafiz',
  'Andika',
];
const FIRST_NAMES_P = [
  'Aisyah',
  'Nadia',
  'Putri',
  'Salsa',
  'Aulia',
  'Dina',
  'Rani',
  'Mei',
  'Zahra',
  'Tiara',
];
const LAST_NAMES = [
  'Pratama',
  'Nasution',
  'Siregar',
  'Lubis',
  'Harahap',
  'Hutapea',
  'Simanjuntak',
  'Batubara',
  'Tanjung',
  'Dalimunthe',
];

export function buildRealisticSeedState(): LmsDatabaseState {
  // 14 Jurusan / Konsentrasi Keahlian
  const majors = [
    { id: 'maj-rpl', kode: 'RPL', nama: 'Rekayasa Perangkat Lunak' },
    { id: 'maj-tkj', kode: 'TKJ', nama: 'Teknik Komputer dan Jaringan' },
    { id: 'maj-dkv', kode: 'DKV', nama: 'Desain Komunikasi Visual' },
    { id: 'maj-tkr', kode: 'TKR', nama: 'Teknik Kendaraan Ringan' },
    { id: 'maj-tsm', kode: 'TSM', nama: 'Teknik Sepeda Motor' },
    { id: 'maj-titl', kode: 'TITL', nama: 'Teknik Instalasi Tenaga Listrik' },
    { id: 'maj-tpm', kode: 'TPM', nama: 'Teknik Pemesinan' },
    { id: 'maj-tav', kode: 'TAV', nama: 'Teknik Audio Video' },
    { id: 'maj-dpib', kode: 'DPIB', nama: 'Desain Pemodelan dan Informasi Bangunan' },
    { id: 'maj-akl', kode: 'AKL', nama: 'Akuntansi dan Keuangan Lembaga' },
    { id: 'maj-mplb', kode: 'MPLB', nama: 'Manajemen Perkantoran dan Layanan Bisnis' },
    { id: 'maj-bdp', kode: 'BDP', nama: 'Bisnis Daring dan Pemasaran' },
    { id: 'maj-tp', kode: 'TP', nama: 'Teknik Pengelasan' },
    { id: 'maj-to', kode: 'TO', nama: 'Teknik Ototronik' },
  ] as const;

  // 18 Rombel: 3 tingkat (10, 11, 12) x 3 rombel x 2 jurusan contoh (RPL, TKJ)
  // Dual-track: Tingkat 10 & 11 = MERDEKA, Tingkat 12 = K13
  const rombels: Rombel[] = [];
  const rombelConfigs: Array<{ tingkat: 10 | 11 | 12; label: string }> = [
    { tingkat: 10, label: 'X' },
    { tingkat: 11, label: 'XI' },
    { tingkat: 12, label: 'XII' },
  ];
  for (const maj of [
    { id: 'maj-rpl', kode: 'RPL' },
    { id: 'maj-tkj', kode: 'TKJ' },
  ]) {
    for (const tc of rombelConfigs) {
      for (let num = 1; num <= 3; num++) {
        const id = `rom-${tc.label.toLowerCase()}-${maj.kode.toLowerCase()}-${num}`;
        rombels.push({
          id,
          tingkat: tc.tingkat,
          major_id: maj.id,
          academic_year_id: 'ay-2025-2',
          kurikulum_acuan: tc.tingkat === 12 ? 'K13' : 'MERDEKA',
          nama_rombel: `${tc.label} ${maj.kode} ${num}`,
          wali_kelas_id:
            id === 'rom-xi-rpl-1'
              ? 'tch-budi'
              : id === 'rom-xii-tkj-1'
                ? 'tch-siti'
                : null,
        });
      }
    }
  }

  // Core executive & admin users
  const users: User[] = [
    {
      id: 'usr-admin',
      nama: 'Fajar Nugroho, S.Kom',
      email: 'admin@smkn1percut.sch.id',
      roles: ['ADMIN'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T07:15:00Z',
    },
    {
      id: 'usr-kepsek',
      nama: 'Drs. H. Kasman, M.Pd',
      email: 'kepsek@smkn1percut.sch.id',
      roles: ['KEPALA_SEKOLAH'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T07:30:00Z',
    },
    {
      id: 'usr-wakasek',
      nama: 'Dra. Ratna Dewi, M.Si',
      email: 'wakasek@smkn1percut.sch.id',
      roles: ['WAKASEK'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T07:45:00Z',
    },
  ];

  // 20 Guru (termasuk 3 Guru Matematika berbeda kelas: Budi, Siti, Darmawan)
  const teachers: Teacher[] = [
    {
      id: 'tch-budi',
      user_id: 'usr-budi',
      nuptk: '4551765666130012',
      nip: '198705122014031002',
      bidang: 'Matematika & Pemrograman Dasar',
    },
    {
      id: 'tch-siti',
      user_id: 'usr-siti',
      nuptk: '5662768669210044',
      nip: '199003212015042001',
      bidang: 'Matematika & Administrasi Jaringan',
    },
    {
      id: 'tch-darmawan',
      user_id: 'usr-darmawan',
      nuptk: '6773769670110088',
      nip: '198511092012121003',
      bidang: 'Matematika',
    },
  ];

  users.push(
    {
      id: 'usr-budi',
      nama: 'Budi Santoso, S.Pd',
      email: 'budi.mtk@smkn1percut.sch.id',
      roles: ['GURU_MAPEL', 'WALI_KELAS'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:00:00Z',
    },
    {
      id: 'usr-siti',
      nama: 'Siti Aminah, S.Pd',
      email: 'siti.mtk@smkn1percut.sch.id',
      roles: ['GURU_MAPEL', 'WALI_KELAS'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:05:00Z',
    },
    {
      id: 'usr-darmawan',
      nama: 'Darmawan Lubis, M.Pd',
      email: 'darmawan.mtk@smkn1percut.sch.id',
      roles: ['GURU_MAPEL'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:08:00Z',
    },
  );

  const extraTeacherFields = [
    'Bahasa Indonesia',
    'Bahasa Inggris',
    'Pendidikan Pancasila',
    'Rekayasa Perangkat Lunak',
    'Teknik Komputer Jaringan',
    'Basis Data',
    'Keamanan Jaringan',
    'Projek IPAS',
    'Informatika',
    'Pendidikan Agama',
    'PJOK',
    'Sejarah',
    'Produk Kreatif & Kewirausahaan',
    'Pemrograman Berorientasi Objek',
    'Sistem Operasi Jaringan',
    'Cloud Computing',
    'Desain UI/UX',
  ];

  for (let i = 0; i < extraTeacherFields.length; i++) {
    const idx = i + 4;
    const uid = `usr-guru-${idx}`;
    const tid = `tch-guru-${idx}`;
    const fname = i % 2 === 0 ? FIRST_NAMES_L[i % 10] : FIRST_NAMES_P[i % 10];
    const lname = LAST_NAMES[(i * 3) % 10];
    users.push({
      id: uid,
      nama: `${fname} ${lname}, S.Pd`,
      email: `guru${idx}@smkn1percut.sch.id`,
      roles: ['GURU_MAPEL'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T07:50:00Z',
    });
    teachers.push({
      id: tid,
      user_id: uid,
      nuptk: `7000765666130${String(idx).padStart(3, '0')}`,
      nip: `198901012018011${String(idx).padStart(3, '0')}`,
      bidang: extraTeacherFields[i],
    });
  }

  // 5 Guru BK, masing-masing memegang 3-4 kelas dari 18 rombel
  const bkCounselors = [
    { id: 'bk-hendra', user_id: 'usr-hendra', nama: 'Hendra Wijaya, S.Pd', email: 'hendra.bk@smkn1percut.sch.id' },
    { id: 'bk-fitri', user_id: 'usr-bk-2', nama: 'Fitri Handayani, S.Pd', email: 'fitri.bk@smkn1percut.sch.id' },
    { id: 'bk-rahmat', user_id: 'usr-bk-3', nama: 'Rahmat Hidayat, S.Pd', email: 'rahmat.bk@smkn1percut.sch.id' },
    { id: 'bk-dewi', user_id: 'usr-bk-4', nama: 'Dewi Sartika, S.Pd', email: 'dewi.bk@smkn1percut.sch.id' },
    { id: 'bk-ilham', user_id: 'usr-bk-5', nama: 'Ilham Saputra, S.Pd', email: 'ilham.bk@smkn1percut.sch.id' },
  ];

  for (const bk of bkCounselors) {
    users.push({
      id: bk.user_id,
      nama: bk.nama,
      email: bk.email,
      roles: ['GURU_BK'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:10:00Z',
    });
  }

  const bkClassAssignments = [
    { id: 'bka-1', bk_id: 'bk-hendra', rombel_id: 'rom-xi-rpl-1' },
    { id: 'bka-2', bk_id: 'bk-hendra', rombel_id: 'rom-xii-tkj-1' },
    { id: 'bka-3', bk_id: 'bk-hendra', rombel_id: 'rom-xi-rpl-2' },
    { id: 'bka-4', bk_id: 'bk-fitri', rombel_id: 'rom-x-rpl-1' },
    { id: 'bka-5', bk_id: 'bk-fitri', rombel_id: 'rom-x-rpl-2' },
    { id: 'bka-6', bk_id: 'bk-fitri', rombel_id: 'rom-x-rpl-3' },
    { id: 'bka-7', bk_id: 'bk-rahmat', rombel_id: 'rom-x-tkj-1' },
    { id: 'bka-8', bk_id: 'bk-rahmat', rombel_id: 'rom-x-tkj-2' },
    { id: 'bka-9', bk_id: 'bk-rahmat', rombel_id: 'rom-x-tkj-3' },
    { id: 'bka-10', bk_id: 'bk-dewi', rombel_id: 'rom-xi-rpl-3' },
    { id: 'bka-11', bk_id: 'bk-dewi', rombel_id: 'rom-xi-tkj-1' },
    { id: 'bka-12', bk_id: 'bk-dewi', rombel_id: 'rom-xi-tkj-2' },
    { id: 'bka-13', bk_id: 'bk-ilham', rombel_id: 'rom-xi-tkj-3' },
    { id: 'bka-14', bk_id: 'bk-ilham', rombel_id: 'rom-xii-rpl-1' },
    { id: 'bka-15', bk_id: 'bk-ilham', rombel_id: 'rom-xii-rpl-2' },
    { id: 'bka-16', bk_id: 'bk-ilham', rombel_id: 'rom-xii-rpl-3' },
    { id: 'bka-17', bk_id: 'bk-dewi', rombel_id: 'rom-xii-tkj-2' },
    { id: 'bka-18', bk_id: 'bk-rahmat', rombel_id: 'rom-xii-tkj-3' },
  ];

  // 180 Siswa Uji:
  // - 40 siswa di XI RPL 1 (untuk uji skenario sesi 40 siswa simultan!)
  // - 140 siswa tersebar di 17 rombel lainnya (total 180 siswa)
  const students: Student[] = [
    {
      id: 'stu-rizky',
      user_id: 'usr-rizky',
      nisn: '0081234501',
      nis: '240101',
      rombel_id: 'rom-xi-rpl-1',
      jenis_kelamin: 'L',
      tanggal_lahir: '2008-04-12',
      status: 'AKTIF',
    },
    {
      id: 'stu-aisyah',
      user_id: 'usr-aisyah',
      nisn: '0081234502',
      nis: '240102',
      rombel_id: 'rom-xi-rpl-1',
      jenis_kelamin: 'P',
      tanggal_lahir: '2008-08-19',
      status: 'AKTIF',
    },
    {
      id: 'stu-dimas',
      user_id: 'usr-dimas',
      nisn: '0079988101',
      nis: '230201',
      rombel_id: 'rom-xii-tkj-1',
      jenis_kelamin: 'L',
      tanggal_lahir: '2007-02-27',
      status: 'PKL',
    },
    {
      id: 'stu-nadia',
      user_id: 'usr-nadia',
      nisn: '0091122301',
      nis: '250101',
      rombel_id: 'rom-x-rpl-1',
      jenis_kelamin: 'P',
      tanggal_lahir: '2009-06-03',
      status: 'AKTIF',
    },
  ];

  users.push(
    {
      id: 'usr-rizky',
      nama: 'Rizky Pratama',
      email: 'rizky.siswa@smkn1percut.sch.id',
      roles: ['SISWA'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:12:00Z',
    },
    {
      id: 'usr-aisyah',
      nama: 'Aisyah Putri Nasution',
      email: 'aisyah.siswa@smkn1percut.sch.id',
      roles: ['SISWA'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:14:00Z',
    },
    {
      id: 'usr-dimas',
      nama: 'Dimas Aditya Siregar',
      email: 'dimas.siswa@smkn1percut.sch.id',
      roles: ['SISWA'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:15:00Z',
    },
    {
      id: 'usr-nadia',
      nama: 'Nadia Safitri Lubis',
      email: 'nadia.siswa@smkn1percut.sch.id',
      roles: ['SISWA'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T08:16:00Z',
    },
  );

  // Fill XI RPL 1 to 40 students (38 more)
  for (let i = 3; i <= 40; i++) {
    const uid = `usr-stu-xirpl1-${i}`;
    const sid = `stu-xirpl1-${i}`;
    const isFemale = i % 2 === 0;
    const fname = isFemale ? FIRST_NAMES_P[i % 10] : FIRST_NAMES_L[i % 10];
    const lname = LAST_NAMES[(i * 7) % 10];
    const nisn = `0081234${String(500 + i).padStart(3, '0')}`;
    users.push({
      id: uid,
      nama: `${fname} ${lname} ${i}`,
      email: `siswa.xirpl1.${i}@smkn1percut.sch.id`,
      roles: ['SISWA'],
      status: 'AKTIF',
      last_login_at: '2026-11-16T07:55:00Z',
    });
    students.push({
      id: sid,
      user_id: uid,
      nisn,
      nis: `2401${String(i).padStart(2, '0')}`,
      rombel_id: 'rom-xi-rpl-1',
      jenis_kelamin: isFemale ? 'P' : 'L',
      tanggal_lahir: '2008-05-15',
      status: 'AKTIF',
    });
  }

  // Fill remaining 138 students across the other 17 rombels (total = 180 students)
  const otherRombels = rombels.filter((r) => r.id !== 'rom-xi-rpl-1');
  for (let seq = 1; seq <= 138; seq++) {
    const targetRombel = otherRombels[(seq - 1) % otherRombels.length];
    const uid = `usr-stu-gen-${seq}`;
    const sid = `stu-gen-${seq}`;
    const isFemale = seq % 2 === 0;
    const fname = isFemale ? FIRST_NAMES_P[seq % 10] : FIRST_NAMES_L[seq % 10];
    const lname = LAST_NAMES[(seq * 3) % 10];
    const nisn = `0089000${String(seq).padStart(3, '0')}`;
    const isPklCandidate = targetRombel.id === 'rom-xii-tkj-1' && seq <= 90;
    users.push({
      id: uid,
      nama: `${fname} ${lname} S${seq}`,
      email: `siswa.gen.${seq}@smkn1percut.sch.id`,
      roles: ['SISWA'],
      status: 'AKTIF',
      last_login_at: '2026-11-15T09:00:00Z',
    });
    students.push({
      id: sid,
      user_id: uid,
      nisn,
      nis: `25${String(seq).padStart(4, '0')}`,
      rombel_id: targetRombel.id,
      jenis_kelamin: isFemale ? 'P' : 'L',
      tanggal_lahir: targetRombel.tingkat === 12 ? '2007-03-10' : '2009-02-14',
      status: isPklCandidate ? 'PKL' : 'AKTIF',
    });
  }

  // Subjects: 5 Umum + Kejuruan + PKL + UKK
  const subjects = [
    { id: 'sub-mtk', kode: 'MTK', nama: 'Matematika', kelompok: 'UMUM' as const },
    { id: 'sub-bind', kode: 'BIND', nama: 'Bahasa Indonesia', kelompok: 'UMUM' as const },
    { id: 'sub-bing', kode: 'BING', nama: 'Bahasa Inggris', kelompok: 'UMUM' as const },
    { id: 'sub-inf', kode: 'INF', nama: 'Informatika', kelompok: 'UMUM' as const },
    { id: 'sub-pkk', kode: 'PKK', nama: 'Projek Kreatif & Kewirausahaan', kelompok: 'UMUM' as const },
    { id: 'sub-rpl-web', kode: 'PWB', nama: 'Pemrograman Web & Perangkat Bergerak', kelompok: 'KEJURUAN' as const },
    { id: 'sub-rpl-db', kode: 'BSD', nama: 'Basis Data & SQL', kelompok: 'KEJURUAN' as const },
    { id: 'sub-tkj-asj', kode: 'ASJ', nama: 'Administrasi Sistem Jaringan', kelompok: 'KEJURUAN' as const },
    { id: 'sub-pkl', kode: 'PKL', nama: 'Praktik Kerja Lapangan', kelompok: 'PKL' as const },
    { id: 'sub-ukk', kode: 'UKK', nama: 'Uji Kompetensi Keahlian', kelompok: 'UKK' as const },
  ];

  // Teacher assignments: 3 guru Matematika berbeda kelas + mapel kejuruan
  const teacherAssignments: TeacherAssignment[] = [
    {
      id: 'ta-budi-mtk-xirpl1',
      teacher_id: 'tch-budi',
      subject_id: 'sub-mtk',
      rombel_id: 'rom-xi-rpl-1',
      academic_year_id: 'ay-2025-2',
      semester: 'GENAP',
      kurikulum_acuan: 'MERDEKA',
      jam_per_minggu: 4,
      status: 'AKTIF',
    },
    {
      id: 'ta-budi-pwb-xirpl1',
      teacher_id: 'tch-budi',
      subject_id: 'sub-rpl-web',
      rombel_id: 'rom-xi-rpl-1',
      academic_year_id: 'ay-2025-2',
      semester: 'GENAP',
      kurikulum_acuan: 'MERDEKA',
      jam_per_minggu: 6,
      status: 'AKTIF',
    },
    {
      id: 'ta-budi-mtk-xrpl1',
      teacher_id: 'tch-budi',
      subject_id: 'sub-mtk',
      rombel_id: 'rom-x-rpl-1',
      academic_year_id: 'ay-2025-2',
      semester: 'GENAP',
      kurikulum_acuan: 'MERDEKA',
      jam_per_minggu: 4,
      status: 'AKTIF',
    },
    {
      id: 'ta-siti-mtk-xiitkj1',
      teacher_id: 'tch-siti',
      subject_id: 'sub-mtk',
      rombel_id: 'rom-xii-tkj-1',
      academic_year_id: 'ay-2025-2',
      semester: 'GENAP',
      kurikulum_acuan: 'K13',
      jam_per_minggu: 4,
      status: 'AKTIF',
    },
    {
      id: 'ta-siti-asj-xiitkj1',
      teacher_id: 'tch-siti',
      subject_id: 'sub-tkj-asj',
      rombel_id: 'rom-xii-tkj-1',
      academic_year_id: 'ay-2025-2',
      semester: 'GENAP',
      kurikulum_acuan: 'K13',
      jam_per_minggu: 6,
      status: 'AKTIF',
    },
    {
      id: 'ta-darmawan-mtk-xirpl2',
      teacher_id: 'tch-darmawan',
      subject_id: 'sub-mtk',
      rombel_id: 'rom-xi-rpl-2',
      academic_year_id: 'ay-2025-2',
      semester: 'GENAP',
      kurikulum_acuan: 'MERDEKA',
      jam_per_minggu: 4,
      status: 'AKTIF',
    },
  ];

  // 10 Siswa PKL di 2 DUDI
  const pklCandidates = [
    'stu-dimas',
    ...students
      .filter(
        (s) =>
          s.id !== 'stu-dimas' &&
          (s.rombel_id === 'rom-xii-tkj-1' || s.rombel_id === 'rom-xii-tkj-2'),
      )
      .slice(0, 9)
      .map((s) => s.id),
  ];
  const pklPlacements: PklPlacement[] = pklCandidates.map((sid, idx) => ({
    id: `plc-${idx + 1}`,
    student_id: sid,
    dudi_id: idx < 5 ? 'dudi-1' : 'dudi-2',
    pks_id: idx < 5 ? 'pks-1' : 'pks-2',
    pembimbing_bk_id: 'bk-hendra',
    pembimbing_dudi_nama: idx < 5 ? 'Ir. Andi Syahputra' : 'Robby Kurniawan, S.T',
    periode_mulai: '2026-07-01',
    periode_selesai: '2026-12-15',
    status: 'BERJALAN',
  }));

  const pklScores: PklScore[] = [
    { id: 'pkls-1', placement_id: 'plc-1', komponen: 'DUDI_HARD', nilai: 88, dinilai_oleh: 'usr-hendra' },
    { id: 'pkls-2', placement_id: 'plc-1', komponen: 'DUDI_SOFT', nilai: 90, dinilai_oleh: 'usr-hendra' },
    { id: 'pkls-3', placement_id: 'plc-1', komponen: 'DUDI_DISIPLIN', nilai: 92, dinilai_oleh: 'usr-hendra' },
    { id: 'pkls-4', placement_id: 'plc-1', komponen: 'SEKOLAH_LAPORAN', nilai: 85, dinilai_oleh: 'usr-hendra' },
  ];

  return {
    school: {
      id: 'school-1',
      npsn: '10214029',
      nama: 'SMK Negeri 1 Percut Sei Tuan',
      alamat: 'Jl. Kolam No. 3, Medan Estate, Kec. Percut Sei Tuan, Kab. Deli Serdang, Sumatera Utara',
      kepala_sekolah: 'Drs. H. Kasman, M.Pd',
      telepon: '(061) 7381234',
      email: 'info@smkn1percut.sch.id',
      logo_url: '/src/assets/images/smkn1_emblem_1794859933905.jpg',
    },
    academic_years: [
      {
        id: 'ay-2025-2',
        tahun_ajaran: '2025/2026',
        semester: 'GENAP',
        tanggal_mulai: '2026-01-05',
        tanggal_selesai: '2026-06-20',
        is_active: true,
      },
      {
        id: 'ay-2025-1',
        tahun_ajaran: '2025/2026',
        semester: 'GANJIL',
        tanggal_mulai: '2025-07-14',
        tanggal_selesai: '2025-12-20',
        is_active: false,
      },
    ],
    majors,
    rombels,
    users,
    teachers,
    students,
    bk_counselors: bkCounselors.map(({ id, user_id }) => ({ id, user_id })),
    bk_class_assignments: bkClassAssignments,
    subjects,
    teacher_assignments: teacherAssignments,
    modules: [
      {
        id: 'mod-1',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        judul: 'Matriks & Transformasi Geometri untuk Grafika Komputer',
        konten:
          'Capaian Pembelajaran (Fase F): Peserta didik mampu memodelkan transformasi geometri bidang (translasi, refleksi, rotasi, dilatasi) menggunakan operasi matriks 2x2 untuk aplikasi pemrograman grafika 2D.\n\n1. Konsep Matriks Transformasi\nSetiap titik P(x, y) dapat direpresentasikan sebagai vektor kolom dan ditransformasikan melalui perkalian matriks M * P.\n\n2. Latihan Refleksi\nTuliskan satu contoh kasus rotasi sprite game sebesar 90 derajat berlawanan arah jarum jam.',
        status: 'PUBLISHED',
        cloned_from: null,
        updated_at: '2026-11-15T09:00:00Z',
      },
      {
        id: 'mod-2',
        teacher_assignment_id: 'ta-budi-pwb-xirpl1',
        judul: 'Arsitektur Type-Safe REST API & Persiapan Backend Rust',
        konten:
          'TP: Peserta didik merancang endpoint REST dengan kontrak tipe eksplisit (Result<T, E>, discriminated union) agar transisi ke Rust (Axum) berjalan mulus.\n\nLangkah Praktikum:\n1. Definisikan tipe Request & Response dengan validasi ketat.\n2. Pisahkan fungsi domain murni dari layer HTTP I/O.',
        status: 'PUBLISHED',
        cloned_from: null,
        updated_at: '2026-11-15T10:30:00Z',
      },
      {
        id: 'mod-3',
        teacher_assignment_id: 'ta-siti-mtk-xiitkj1',
        judul: 'KD 3.28: Statistika Deskriptif & Analisis Trafik Jaringan',
        konten:
          'KI/KD (K13 Revisi): Menganalisis ukuran pemusatan dan penyebaran data paket jaringan sekolah.',
        status: 'PUBLISHED',
        cloned_from: null,
        updated_at: '2026-11-14T11:00:00Z',
      },
    ],
    sessions: [
      {
        id: 'ses-1',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        pertemuan_ke: 1,
        tanggal: '2026-11-16',
        jam_mulai: '07:30',
        jam_selesai: '23:59',
        tipe_sesi: 'TEORI',
        topik: 'Matriks Transformasi 2D pada Layar Koordinat (Sesi Uji 40 Siswa)',
        module_id: 'mod-1',
        status: 'OPEN',
        minimum_read_pct: 60,
      },
      {
        id: 'ses-2',
        teacher_assignment_id: 'ta-budi-pwb-xirpl1',
        pertemuan_ke: 1,
        tanggal: '2026-11-16',
        jam_mulai: '07:30',
        jam_selesai: '23:59',
        tipe_sesi: 'PRAKTIK',
        topik: 'Validasi Input & Algebraic Error Handling',
        module_id: 'mod-2',
        status: 'OPEN',
        minimum_read_pct: 50,
      },
      {
        id: 'ses-3',
        teacher_assignment_id: 'ta-siti-mtk-xiitkj1',
        pertemuan_ke: 1,
        tanggal: '2026-11-16',
        jam_mulai: '08:00',
        jam_selesai: '10:00',
        tipe_sesi: 'TEORI',
        topik: 'Statistika Deskriptif (K13)',
        module_id: 'mod-3',
        status: 'CLOSED',
        minimum_read_pct: 60,
      },
    ],
    attendance_records: [
      {
        id: 'att-ses-1-stu-aisyah',
        session_id: 'ses-1',
        student_id: 'stu-aisyah',
        status: 'HADIR',
        aktivitas_minimum_terpenuhi: true,
        read_pct: 100,
        submitted_task: false,
        submitted_reflection: true,
        diakses_pada: '2026-11-16T08:05:00Z',
        diaktifkan_pada: '2026-11-16T08:10:00Z',
        override_oleh: null,
        alasan_override: null,
      },
    ],
    assignments: [
      {
        id: 'task-1',
        session_id: 'ses-1',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        judul: 'LKPD 1: Perhitungan Matriks Rotasi 2D',
        deskripsi: 'Hitung koordinat bayangan segitiga ABC setelah dirotasi 90° terhadap titik asal O(0,0). Sertakan langkah perkalian matriks.',
        deadline: '2026-11-20T23:59:00Z',
        tipe: 'TUGAS',
        rubrik: 'Ketepatan rumus (40%), Langkah perhitungan (40%), Kerapian penulisan (20%).',
        cloned_from: null,
      },
      {
        id: 'task-2',
        session_id: 'ses-2',
        teacher_assignment_id: 'ta-budi-pwb-xirpl1',
        judul: 'Praktikum 1: Skema Result<T, E> untuk Endpoint Nilai',
        deskripsi: 'Tuliskan struktur tipe error untuk endpoint input nilai agar tidak mengembalikan null tanpa pesan.',
        deadline: '2026-11-21T23:59:00Z',
        tipe: 'PRAKTIK',
        rubrik: 'Kelengkapan varian error (50%), Kejelasan pesan (50%).',
        cloned_from: null,
      },
    ],
    submissions: [
      {
        id: 'subm-1',
        assignment_id: 'task-1',
        student_id: 'stu-aisyah',
        file_url: null,
        teks: 'Diketahui A(2,1), B(4,1), C(4,4). Matriks rotasi 90° = [[0,-1],[1,0]]. Hasil: A\'(-1,2), B\'(-1,4), C\'(-4,4).',
        submitted_at: '2026-11-16T09:12:00Z',
        nilai: 92,
        dinilai_oleh: 'tch-budi',
        catatan_guru: 'Langkah perkalian matriks sangat rapi dan tepat.',
      },
    ],
    notebooks: [
      {
        id: 'nb-rizky-mtk',
        student_id: 'stu-rizky',
        subject_id: 'sub-mtk',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
      },
      {
        id: 'nb-aisyah-mtk',
        student_id: 'stu-aisyah',
        subject_id: 'sub-mtk',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
      },
    ],
    notebook_entries: [
      {
        id: 'nbe-1',
        notebook_id: 'nb-rizky-mtk',
        judul: 'Catatan Pertemuan 1: Matriks Rotasi',
        konten: 'Rumus rotasi berlawanan jarum jam 90 derajat: x\' = -y, y\' = x. Perlu latihan lagi untuk sudut 45 derajat.',
        gambar_url: null,
        komentar_guru: 'Bagus Rizky, coba kerjakan soal nomor 3 untuk sudut 45°.',
        created_at: '2026-11-16T08:30:00Z',
        updated_at: '2026-11-16T08:45:00Z',
      },
      {
        id: 'nbe-2',
        notebook_id: 'nb-aisyah-mtk',
        judul: 'Ringkasan Transformasi Komposisi',
        konten: 'Urutan perkalian matriks komposisi dibaca dari kanan ke kiri: T2 * T1 * P.',
        gambar_url: null,
        komentar_guru: null,
        created_at: '2026-11-16T08:35:00Z',
        updated_at: '2026-11-16T08:35:00Z',
      },
    ],
    grade_components: [
      { id: 'gc-1', teacher_assignment_id: 'ta-budi-mtk-xirpl1', nama: 'FORMATIF', bobot: 30 },
      { id: 'gc-2', teacher_assignment_id: 'ta-budi-mtk-xirpl1', nama: 'SUMATIF', bobot: 40 },
      { id: 'gc-3', teacher_assignment_id: 'ta-budi-mtk-xirpl1', nama: 'PRAKTIK', bobot: 30 },
      { id: 'gc-4', teacher_assignment_id: 'ta-budi-mtk-xirpl1', nama: 'REMEDIAL', bobot: 0 },
      { id: 'gc-5', teacher_assignment_id: 'ta-siti-mtk-xiitkj1', nama: 'FORMATIF', bobot: 40 },
      { id: 'gc-6', teacher_assignment_id: 'ta-siti-mtk-xiitkj1', nama: 'SUMATIF', bobot: 60 },
    ],
    grades: [
      {
        id: 'grd-1',
        student_id: 'stu-rizky',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        component_id: 'gc-1',
        nilai: 84,
        catatan: 'Aktif bertanya di kelas',
      },
      {
        id: 'grd-2',
        student_id: 'stu-rizky',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        component_id: 'gc-2',
        nilai: 80,
        catatan: 'Sumatif lingkup materi 1',
      },
      {
        id: 'grd-3',
        student_id: 'stu-rizky',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        component_id: 'gc-3',
        nilai: 88,
        catatan: 'Praktik koordinat',
      },
      {
        id: 'grd-4',
        student_id: 'stu-aisyah',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        component_id: 'gc-1',
        nilai: 92,
        catatan: 'Sangat konsisten',
      },
      {
        id: 'grd-5',
        student_id: 'stu-aisyah',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        component_id: 'gc-2',
        nilai: 90,
        catatan: 'Nilai sumatif tinggi',
      },
      {
        id: 'grd-6',
        student_id: 'stu-aisyah',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        component_id: 'gc-3',
        nilai: 94,
        catatan: 'Laporan lengkap',
      },
    ],
    erapor_mappings: [
      {
        id: 'erm-1',
        academic_year_id: 'ay-2025-2',
        mapel_id: null,
        template_name: 'Format Impor e-Rapor SMK Kemendikdasmen v7.0',
        mapping: [
          { erapor_column: 'NISN', system_field: 'nisn' },
          { erapor_column: 'Nama Peserta Didik', system_field: 'nama_siswa' },
          { erapor_column: 'Rombel', system_field: 'nama_rombel' },
          { erapor_column: 'Nilai Rapor', system_field: 'nilai_akhir' },
          { erapor_column: 'Predikat', system_field: 'predikat' },
          { erapor_column: 'Deskripsi Capaian Kompetensi', system_field: 'deskripsi_capaian' },
        ],
        created_by: 'usr-admin',
      },
    ],
    question_banks: [
      {
        id: 'qb-mtk-1',
        subject_id: 'sub-mtk',
        teacher_id: 'tch-budi',
        judul: 'Bank Soal Transformasi & Matriks XI RPL',
        kurikulum_acuan: 'MERDEKA',
      },
    ],
    questions: [
      {
        id: 'q-1',
        bank_id: 'qb-mtk-1',
        tipe: 'PG',
        stem: 'Bayangan titik P(3, -2) jika ditranslasikan oleh T(4, 5) adalah...',
        options: ['A. (7, 3)', 'B. (-1, -7)', 'C. (7, -7)', 'D. (1, 3)'],
        jawaban: 'A. (7, 3)',
        rubrik: 'x\' = 3+4 = 7, y\' = -2+5 = 3',
        skor: 50,
        level_kognitif: 'C2',
      },
      {
        id: 'q-2',
        bank_id: 'qb-mtk-1',
        tipe: 'PG',
        stem: 'Jika titik A(2, 5) dicerminkan terhadap sumbu X, maka koordinat bayangannya adalah...',
        options: ['A. (-2, 5)', 'B. (2, -5)', 'C. (-2, -5)', 'D. (5, 2)'],
        jawaban: 'B. (2, -5)',
        rubrik: 'Refleksi sumbu X membalik tanda y menjadi -y',
        skor: 50,
        level_kognitif: 'C2',
      },
    ],
    exams: [
      {
        id: 'ex-1',
        teacher_assignment_id: 'ta-budi-mtk-xirpl1',
        tipe: 'MID',
        judul: 'STS Genap Matematika XI RPL 1',
        waktu_mulai: '2026-11-16T08:00:00Z',
        durasi_menit: 90,
        token: 'RPL2026',
        status: 'AKTIF',
        parent_exam_id: null,
      },
      {
        id: 'ex-2',
        teacher_assignment_id: 'ta-budi-pwb-xirpl1',
        tipe: 'CUSTOM',
        judul: 'Kuis Praktik API TypeScript XI RPL 1',
        waktu_mulai: '2026-11-17T10:00:00Z',
        durasi_menit: 60,
        token: 'WEB110',
        status: 'TERJADWAL',
        parent_exam_id: null,
      },
    ],
    exam_sessions: [
      {
        id: 'exs-1',
        exam_id: 'ex-1',
        student_id: 'stu-aisyah',
        status: 'SELESAI',
        started_at: '2026-11-16T08:02:00Z',
        finished_at: '2026-11-16T08:40:00Z',
        tab_switch_count: 0,
      },
    ],
    exam_answers: [
      {
        id: 'exa-1',
        exam_session_id: 'exs-1',
        question_id: 'q-1',
        jawaban: 'A. (7, 3)',
        skor: 50,
        disimpan_pada: '2026-11-16T08:15:00Z',
      },
      {
        id: 'exa-2',
        exam_session_id: 'exs-1',
        question_id: 'q-2',
        jawaban: 'B. (2, -5)',
        skor: 50,
        disimpan_pada: '2026-11-16T08:35:00Z',
      },
    ],
    dudis: [
      {
        id: 'dudi-1',
        nama: 'PT Telkom Indonesia Witel Medan',
        alamat: 'Jl. Prof. HM. Yamin No. 13, Medan',
        bidang: 'Telekomunikasi & Jaringan Fiber Optik',
        kontak: 'humas.medan@telkom.co.id',
      },
      {
        id: 'dudi-2',
        nama: 'CV Nusantara Digital Solution',
        alamat: 'Jl. Williem Iskandar No. 45, Deli Serdang',
        bidang: 'Pengembangan Perangkat Lunak',
        kontak: 'hrd@nusantaradigital.id',
      },
    ],
    pks_documents: [
      {
        id: 'pks-1',
        dudi_id: 'dudi-1',
        nomor: 'PKS/SMKN1PST/2026/014',
        tanggal_mulai: '2026-01-10',
        tanggal_selesai: '2026-12-31',
        file_url: 'https://arsip.smkn1percut.sch.id/pks/telkom-2026.pdf',
      },
      {
        id: 'pks-2',
        dudi_id: 'dudi-2',
        nomor: 'PKS/SMKN1PST/2026/022',
        tanggal_mulai: '2026-02-01',
        tanggal_selesai: '2026-12-31',
        file_url: 'https://arsip.smkn1percut.sch.id/pks/nusantara-2026.pdf',
      },
    ],
    pkl_placements: pklPlacements,
    pkl_journals: [
      {
        id: 'pklj-1',
        placement_id: 'plc-1',
        tanggal: '2026-11-15',
        aktivitas: 'Melakukan terminasi kabel fiber optik ODP dan pengukuran redaman OTDR di area Percut.',
        validasi_bk: true,
        catatan_bk: 'Aktivitas sesuai kompetensi TKJ.',
      },
      {
        id: 'pklj-2',
        placement_id: 'plc-1',
        tanggal: '2026-11-16',
        aktivitas: 'Konfigurasi VLAN switch distribusi dan dokumentasi topologi pelanggan korporat.',
        validasi_bk: false,
        catatan_bk: '',
      },
    ],
    pkl_scores: pklScores,
    mapel_pkl_contributions: [
      {
        id: 'mpc-1',
        student_id: 'stu-dimas',
        subject_id: 'sub-tkj-asj',
        nilai: 89,
        guru_id: 'tch-siti',
        catatan: 'Nilai kontribusi proyek konfigurasi server saat PKL (terpisah dari nilai PKL BK).',
      },
    ],
    prompt_templates: [
      {
        id: 'tpl-merdeka-kejuruan',
        kode: 'MODUL-AJAR-MERDEKA-KEJURUAN',
        nama: 'Modul Ajar Kurikulum Merdeka (Mapel Kejuruan SMK)',
        kategori: 'KEJURUAN',
        kurikulum_acuan: 'MERDEKA',
        input_fields: [
          { key: 'topik', label: 'Topik / Elemen Kompetensi', placeholder: 'Misal: Pembuatan REST API Type-Safe', required: true },
          { key: 'model_pembelajaran', label: 'Model Pembelajaran', placeholder: 'Project-Based Learning (PjBL)', required: true },
          { key: 'dimensi_profil', label: 'Dimensi Profil Pelajar Pancasila', placeholder: 'Bernalar Kritis, Mandiri, Gotong Royong', required: false },
        ],
        template_body:
          'Susun Modul Ajar SMK Kurikulum Merdeka untuk:\n- Sekolah: {{nama_sekolah}} (NPSN {{npsn}})\n- Mata Pelajaran: {{mapel}}\n- Konsentrasi Keahlian: {{jurusan}}\n- Kelas / Fase: {{kelas}} / {{fase}} ({{jumlah_siswa}} siswa)\n- Tahun Ajaran / Semester: {{tahun_ajaran}} / {{semester}}\n- Kurikulum Acuan: {{kurikulum_acuan}}\n- Alokasi Waktu: {{alokasi_jp}}\n- Guru Pengampu: {{nama_guru}} (NIP {{nip_guru}})\n\nFokus Materi:\n- Topik: {{topik}}\n- Model Pembelajaran: {{model_pembelajaran}}\n- Dimensi Profil: {{dimensi_profil}}',
        output_structure:
          '1. Informasi Umum & CP/TP/ATP\n2. Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)\n3. Skenario Praktik Bengkel/Lab (Pendahuluan, Inti PjBL, Penutup)\n4. Asesmen Diagnostik, Formatif, Sumatif & Rubrik Unjuk Kerja',
        validation_checklist: [
          'CP, TP, dan ATP sesuai fase SMK telah tercantum',
          'KKTP dan rubrik asesmen unjuk kerja terukur',
          'Tidak mengandung data pribadi siswa (NISN/nama)',
          'Alokasi waktu sesuai jadwal minggu efektif',
        ],
        version: 2,
        status: 'AKTIF',
      },
      {
        id: 'tpl-k13-umum',
        kode: 'RPP-K13-UMUM',
        nama: 'RPP K13 Revisi (Mapel Umum)',
        kategori: 'UMUM',
        kurikulum_acuan: 'K13',
        input_fields: [
          { key: 'topik', label: 'Materi Pokok & KD', placeholder: 'Misal: KD 3.28 Statistika Deskriptif', required: true },
          { key: 'model_pembelajaran', label: 'Metode Pembelajaran', placeholder: 'Discovery Learning', required: true },
        ],
        template_body:
          'Susun RPP K13 Revisi 1 Lembar untuk:\n- Sekolah: {{nama_sekolah}}\n- Mata Pelajaran: {{mapel}}\n- Kelas / Jurusan: {{kelas}} / {{jurusan}}\n- Kurikulum: {{kurikulum_acuan}}\n- Alokasi: {{alokasi_jp}}\n- Guru: {{nama_guru}}\n- Materi Pokok & KD: {{topik}}\n- Metode: {{model_pembelajaran}}',
        output_structure:
          '1. Kompetensi Inti (KI) & Kompetensi Dasar (KD)\n2. Tujuan Pembelajaran\n3. Langkah Pembelajaran (Pendahuluan, Inti, Penutup)\n4. Penilaian Pengetahuan & Keterampilan',
        validation_checklist: [
          'KI dan KD K13 Revisi sudah sesuai',
          'Indikator Pencapaian Kompetensi (IPK) lengkap',
          'Instrumen penilaian pengetahuan dan keterampilan tersedia',
        ],
        version: 1,
        status: 'AKTIF',
      },
      {
        id: 'tpl-pkl',
        kode: 'PANDUAN-PKL-SMK',
        nama: 'Program & Jurnal Pembimbingan PKL',
        kategori: 'PKL',
        kurikulum_acuan: 'BOTH',
        input_fields: [
          { key: 'topik', label: 'Fokus Capaian Industri', placeholder: 'Misal: Kompetensi Teknisi Fiber Optic', required: true },
        ],
        template_body:
          'Susun Panduan Pembimbingan PKL untuk {{nama_sekolah}} jurusan {{jurusan}} dengan fokus {{topik}} pada kurikulum {{kurikulum_acuan}}.',
        output_structure: '1. Capaian PKL di DUDI\n2. Format Logbook Harian\n3. Rubrik DUDI & Sekolah',
        validation_checklist: [
          'Selaras dengan MoU/PKS DUDI',
          'Komponen penilaian DUDI dan sekolah terpisah jelas',
        ],
        version: 1,
        status: 'AKTIF',
      },
      {
        id: 'tpl-ukk',
        kode: 'PERANGKAT-UKK-SMK',
        nama: 'Perangkat Uji Kompetensi Keahlian (UKK)',
        kategori: 'UKK',
        kurikulum_acuan: 'BOTH',
        input_fields: [
          { key: 'topik', label: 'Skema Okupasi / Unit Kompetensi', placeholder: 'Misal: Pemrogram Junior (SKKNI)', required: true },
        ],
        template_body:
          'Susun Lembar Penilaian UKK untuk {{nama_sekolah}} jurusan {{jurusan}} skema {{topik}}.',
        output_structure: '1. Daftar Unit Kompetensi\n2. Skenario Uji Praktik\n3. Rubrik Kompeten/Belum Kompeten',
        validation_checklist: [
          'Mengacu skema SKKNI / LSP P1',
          'Kriteria unjuk kerja (KUK) terverifikasi',
        ],
        version: 1,
        status: 'AKTIF',
      },
    ],
    teacher_documents: [
      {
        id: 'tdoc-1',
        teacher_assignment_id: 'ta-budi-pwb-xirpl1',
        template_id: 'tpl-merdeka-kejuruan',
        judul: 'Modul Ajar PjBL Type-Safe REST API XI RPL 1',
        konten: 'Modul Ajar lengkap dengan CP/TP/ATP/KKTP untuk kelas XI RPL 1 telah disusun dan divalidasi.',
        status: 'PUBLISHED',
        generated_prompt: 'Prompt ter-generate untuk XI RPL 1',
        generated_at: '2026-11-10T09:00:00Z',
        pasted_at: '2026-11-10T09:20:00Z',
        published_at: '2026-11-10T09:30:00Z',
        checklist_state: {
          'CP, TP, dan ATP sesuai fase SMK telah tercantum': true,
          'KKTP dan rubrik asesmen unjuk kerja terukur': true,
          'Tidak mengandung data pribadi siswa (NISN/nama)': true,
          'Alokasi waktu sesuai jadwal minggu efektif': true,
        },
      },
      {
        id: 'tdoc-2',
        teacher_assignment_id: 'ta-siti-mtk-xiitkj1',
        template_id: 'tpl-k13-umum',
        judul: 'RPP Statistika XII TKJ 1 (Belum Publish)',
        konten: 'Draft awal RPP K13 Statistika Deskriptif.',
        status: 'DRAFT',
        generated_prompt: 'Prompt K13 untuk XII TKJ 1',
        generated_at: '2026-11-12T11:00:00Z',
        pasted_at: '2026-11-12T11:15:00Z',
        published_at: null,
        checklist_state: {
          'KI dan KD K13 Revisi sudah sesuai': true,
        },
      },
    ],
    notifications: [
      {
        id: 'notif-1',
        user_id: 'usr-siti',
        tipe: 'PERINGATAN',
        judul: 'Kelengkapan Perangkat Ajar Belum Publish',
        pesan: 'RPP K13 untuk XII TKJ 1 masih berstatus DRAFT. Mohon lengkapi checklist validasi dan publish sebelum akhir pekan.',
        entitas: 'teacher_documents',
        entitas_id: 'tdoc-2',
        dibaca_at: null,
        created_at: '2026-11-15T14:00:00Z',
      },
      {
        id: 'notif-2',
        user_id: 'usr-rizky',
        tipe: 'AKADEMIK',
        judul: 'Sesi Matematika Pertemuan 1 Dibuka',
        pesan: 'Pak Budi Santoso membuka sesi "Matriks Transformasi 2D". Penuhi aktivitas minimum agar tercatat HADIR.',
        entitas: 'sessions',
        entitas_id: 'ses-1',
        dibaca_at: null,
        created_at: '2026-11-16T07:35:00Z',
      },
    ],
    audit_logs: [
      {
        id: 'aud-1',
        user_id: 'usr-budi',
        aksi: 'OPEN_SESSION',
        entitas: 'sessions',
        entitas_id: 'ses-1',
        detail: 'Membuka sesi pertemuan ke-1 Matematika XI RPL 1 (07:30–23:59)',
        created_at: '2026-11-16T07:30:00Z',
      },
      {
        id: 'aud-2',
        user_id: 'usr-aisyah',
        aksi: 'SESSION_ACTIVITY_HADIR',
        entitas: 'attendance_records',
        entitas_id: 'att-ses-1-stu-aisyah',
        detail: 'Siswa memenuhi aktivitas minimum (100% baca modul + refleksi) -> HADIR',
        created_at: '2026-11-16T08:10:00Z',
      },
    ],
    import_batches: [
      {
        id: 'imp-1',
        tipe: 'SISWA',
        filename: 'dapodik_siswa_xi_rpl_2026.csv',
        status: 'SELESAI',
        total_baris: 40,
        baris_sukses: 40,
        baris_error: 0,
        error_logs: [],
        created_by: 'usr-admin',
        created_at: '2026-11-01T08:00:00Z',
      },
    ],
    coaching_notes: [
      {
        id: 'cn-1',
        author_user_id: 'usr-hendra',
        target_type: 'SISWA',
        target_id: 'stu-rizky',
        judul: 'Pemantauan Kedisiplinan Tugas Awal Semester',
        catatan: 'Siswa aktif di buku tulis, perlu pendampingan ketepatan waktu pengumpulan LKPD 1.',
        created_at: '2026-11-15T13:00:00Z',
      },
      {
        id: 'cn-2',
        author_user_id: 'usr-kepsek',
        target_type: 'GURU',
        target_id: 'tch-siti',
        judul: 'Supervisi Administrasi Perangkat Ajar K13',
        catatan: 'RPP XII TKJ 1 masih DRAFT; wakasek telah mengirim pengingat tindak lanjut.',
        created_at: '2026-11-15T15:00:00Z',
      },
    ],
    walikelas_notes: {
      'stu-rizky': 'Menunjukkan minat kuat pada pemrograman backend. Tingkatkan ketelitian pada latihan matriks.',
      'stu-aisyah': 'Sangat konsisten dalam kehadiran dan penyelesaian tugas tepat waktu.',
    },
    backup_history: [
      {
        id: 'bkp-1',
        filename: 'lms_smkn1percut_20261116_0200.sql.gz',
        size_bytes: 18432910,
        status: 'OK',
        created_at: '2026-11-16T02:00:00Z',
      },
      {
        id: 'bkp-2',
        filename: 'lms_smkn1percut_20261115_0200.sql.gz',
        size_bytes: 18391040,
        status: 'OK',
        created_at: '2026-11-15T02:00:00Z',
      },
    ],
  };
}
