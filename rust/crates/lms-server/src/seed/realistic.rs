use rust_decimal::Decimal;
use serde_json::json;
use sqlx::MySqlPool;

const FIRST_NAMES_L: [&str; 10] = [
    "Rizky", "Dimas", "Bagas", "Fadli", "Ilham", "Arif", "Reza", "Yoga", "Hafiz", "Andika",
];
const FIRST_NAMES_P: [&str; 10] = [
    "Aisyah", "Nadia", "Putri", "Salsa", "Aulia", "Dina", "Rani", "Mei", "Zahra", "Tiara",
];
const LAST_NAMES: [&str; 10] = [
    "Pratama",
    "Nasution",
    "Siregar",
    "Lubis",
    "Harahap",
    "Hutapea",
    "Simanjuntak",
    "Batubara",
    "Tanjung",
    "Dalimunthe",
];

pub async fn run_idempotent_seed(pool: &MySqlPool) -> anyhow::Result<()> {
    let mut tx = pool.begin().await?;

    // 1. Academic Years
    sqlx::query(
        r#"
        INSERT INTO academic_years (id, tahun_ajaran, semester, tanggal_mulai, tanggal_selesai, is_active)
        VALUES
          (1, '2025/2026', 'GENAP', '2026-01-05', '2026-06-20', TRUE),
          (2, '2025/2026', 'GANJIL', '2025-07-14', '2025-12-20', FALSE)
        ON DUPLICATE KEY UPDATE
          tanggal_mulai = VALUES(tanggal_mulai),
          tanggal_selesai = VALUES(tanggal_selesai),
          is_active = VALUES(is_active)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 2. Curricula (Dual-Track)
    sqlx::query(
        r#"
        INSERT INTO curricula (id, kode, deskripsi)
        VALUES
          (1, 'MERDEKA', 'Kurikulum Merdeka SMK (CP / TP / ATP / KKTP) — Kelas X dan XI'),
          (2, 'K13', 'Kurikulum 2013 Revisi SMK (KI / KD / IPK) — Kelas XII')
        ON DUPLICATE KEY UPDATE
          deskripsi = VALUES(deskripsi)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 3. School Profile
    sqlx::query(
        r#"
        INSERT INTO schools (id, npsn, nama, alamat, kepala_sekolah, telepon, email, logo_url)
        VALUES (
          1,
          '10214029',
          'SMK Negeri 1 Percut Sei Tuan',
          'Jl. Kolam No. 3, Medan Estate, Kec. Percut Sei Tuan, Kab. Deli Serdang, Sumatera Utara',
          'Drs. H. Kasman, M.Pd',
          '(061) 7381234',
          'info@smkn1percut.sch.id',
          '/src/assets/images/smkn1_emblem_1794859933905.jpg'
        )
        ON DUPLICATE KEY UPDATE
          nama = VALUES(nama),
          alamat = VALUES(alamat),
          kepala_sekolah = VALUES(kepala_sekolah),
          telepon = VALUES(telepon),
          email = VALUES(email),
          logo_url = VALUES(logo_url)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 4. 14 Majors / Konsentrasi Keahlian
    let majors = [
        (1_i64, "RPL", "Rekayasa Perangkat Lunak"),
        (2, "TKJ", "Teknik Komputer dan Jaringan"),
        (3, "DKV", "Desain Komunikasi Visual"),
        (4, "TKR", "Teknik Kendaraan Ringan"),
        (5, "TSM", "Teknik Sepeda Motor"),
        (6, "TITL", "Teknik Instalasi Tenaga Listrik"),
        (7, "TPM", "Teknik Pemesinan"),
        (8, "TAV", "Teknik Audio Video"),
        (9, "DPIB", "Desain Pemodelan dan Informasi Bangunan"),
        (10, "AKL", "Akuntansi dan Keuangan Lembaga"),
        (11, "MPLB", "Manajemen Perkantoran dan Layanan Bisnis"),
        (12, "BDP", "Bisnis Daring dan Pemasaran"),
        (13, "TP", "Teknik Pengelasan"),
        (14, "TO", "Teknik Ototronik"),
    ];
    for (id, kode, nama) in majors {
        sqlx::query(
            "INSERT INTO majors (id, kode, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE kode = VALUES(kode), nama = VALUES(nama)",
        )
        .bind(id)
        .bind(kode)
        .bind(nama)
        .execute(&mut *tx)
        .await?;
    }

    // 5. Core Users (Admin=1, Kepsek=2, Wakasek=3, Budi=4, Siti=5, Darmawan=6)
    let core_users = [
        (1_i64, "Fajar Nugroho, S.Kom", "admin@smkn1percut.sch.id", "ADMIN"),
        (2, "Drs. H. Kasman, M.Pd", "kepsek@smkn1percut.sch.id", "KEPALA_SEKOLAH"),
        (3, "Dra. Ratna Dewi, M.Si", "wakasek@smkn1percut.sch.id", "WAKASEK"),
        (4, "Budi Santoso, S.Pd", "budi.mtk@smkn1percut.sch.id", "GURU_MAPEL"),
        (5, "Siti Aminah, S.Pd", "siti.mtk@smkn1percut.sch.id", "GURU_MAPEL"),
        (6, "Darmawan Lubis, M.Pd", "darmawan.mtk@smkn1percut.sch.id", "GURU_MAPEL"),
    ];
    for (uid, nama, email, role) in core_users {
        sqlx::query(
            r#"
            INSERT INTO users (id, nama, email, password_hash, role, status, last_login_at)
            VALUES (?, ?, ?, 'plain:smkn1percut', ?, 'AKTIF', '2026-11-16 08:00:00')
            ON DUPLICATE KEY UPDATE nama = VALUES(nama), role = VALUES(role), status = 'AKTIF'
            "#,
        )
        .bind(uid)
        .bind(nama)
        .bind(email)
        .bind(role)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, ?)")
            .bind(uid)
            .bind(role)
            .execute(&mut *tx)
            .await?;
    }

    // Multi-role Wali Kelas for Budi (4) and Siti (5)
    for uid in [4_i64, 5_i64] {
        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'WALI_KELAS')")
            .bind(uid)
            .execute(&mut *tx)
            .await?;
    }

    // 6. Core Teachers (1=Budi, 2=Siti, 3=Darmawan)
    let core_teachers = [
        (1_i64, 4_i64, "4551765666130012", "198705122014031002", "Matematika & Pemrograman Dasar"),
        (2, 5, "5662768669210044", "199003212015042001", "Matematika & Administrasi Jaringan"),
        (3, 6, "6773769670110088", "198511092012121003", "Matematika"),
    ];
    for (tid, uid, nuptk, nip, bidang) in core_teachers {
        sqlx::query(
            "INSERT INTO teachers (id, user_id, nuptk, nip, bidang) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE bidang = VALUES(bidang)",
        )
        .bind(tid)
        .bind(uid)
        .bind(nuptk)
        .bind(nip)
        .bind(bidang)
        .execute(&mut *tx)
        .await?;
    }

    // 7. 17 Additional Teachers (users 7..23 -> teachers 4..20)
    let extra_teacher_fields = [
        "Bahasa Indonesia",
        "Bahasa Inggris",
        "Pendidikan Pancasila",
        "Rekayasa Perangkat Lunak",
        "Teknik Komputer Jaringan",
        "Basis Data",
        "Keamanan Jaringan",
        "Projek IPAS",
        "Informatika",
        "Pendidikan Agama",
        "PJOK",
        "Sejarah",
        "Produk Kreatif & Kewirausahaan",
        "Pemrograman Berorientasi Objek",
        "Sistem Operasi Jaringan",
        "Cloud Computing",
        "Desain UI/UX",
    ];
    for (i, bidang) in extra_teacher_fields.iter().enumerate() {
        let tid = (i + 4) as i64;
        let uid = (i + 7) as i64;
        let fname = if i % 2 == 0 {
            FIRST_NAMES_L[i % 10]
        } else {
            FIRST_NAMES_P[i % 10]
        };
        let lname = LAST_NAMES[(i * 3) % 10];
        let nama = format!("{fname} {lname}, S.Pd");
        let email = format!("guru{tid}@smkn1percut.sch.id");
        let nuptk = format!("7000765666130{tid:03}");
        let nip = format!("198901012018011{tid:03}");

        sqlx::query(
            r#"
            INSERT INTO users (id, nama, email, password_hash, role, status, last_login_at)
            VALUES (?, ?, ?, 'plain:smkn1percut', 'GURU_MAPEL', 'AKTIF', '2026-11-16 07:50:00')
            ON DUPLICATE KEY UPDATE nama = VALUES(nama)
            "#,
        )
        .bind(uid)
        .bind(&nama)
        .bind(&email)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'GURU_MAPEL')")
            .bind(uid)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "INSERT INTO teachers (id, user_id, nuptk, nip, bidang) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE bidang = VALUES(bidang)",
        )
        .bind(tid)
        .bind(uid)
        .bind(&nuptk)
        .bind(&nip)
        .bind(*bidang)
        .execute(&mut *tx)
        .await?;
    }

    // 8. 5 BK Counselors (users 24..28 -> bk_counselors 1..5)
    let bk_list = [
        (1_i64, 24_i64, "Hendra Wijaya, S.Pd", "hendra.bk@smkn1percut.sch.id"),
        (2, 25, "Fitri Handayani, S.Pd", "fitri.bk@smkn1percut.sch.id"),
        (3, 26, "Rahmat Hidayat, S.Pd", "rahmat.bk@smkn1percut.sch.id"),
        (4, 27, "Dewi Sartika, S.Pd", "dewi.bk@smkn1percut.sch.id"),
        (5, 28, "Ilham Saputra, S.Pd", "ilham.bk@smkn1percut.sch.id"),
    ];
    for (bk_id, uid, nama, email) in bk_list {
        sqlx::query(
            r#"
            INSERT INTO users (id, nama, email, password_hash, role, status, last_login_at)
            VALUES (?, ?, ?, 'plain:smkn1percut', 'GURU_BK', 'AKTIF', '2026-11-16 08:10:00')
            ON DUPLICATE KEY UPDATE nama = VALUES(nama)
            "#,
        )
        .bind(uid)
        .bind(nama)
        .bind(email)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'GURU_BK')")
            .bind(uid)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            "INSERT INTO bk_counselors (id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)",
        )
        .bind(bk_id)
        .bind(uid)
        .execute(&mut *tx)
        .await?;
    }

    // 9. 18 Rombels (RPL id=1, TKJ id=2; X/XI=MERDEKA, XII=K13)
    // IDs:
    //  1..3: X RPL 1..3 | 4..6: XI RPL 1..3 | 7..9: XII RPL 1..3
    //  10..12: X TKJ 1..3 | 13..15: XI TKJ 1..3 | 16..18: XII TKJ 1..3
    let mut rombel_idx = 0_i64;
    for (major_id, major_kode) in [(1_i64, "RPL"), (2_i64, "TKJ")] {
        for (tingkat, label) in [(10_i32, "X"), (11, "XI"), (12, "XII")] {
            for num in 1..=3 {
                rombel_idx += 1;
                let nama_rombel = format!("{label} {major_kode} {num}");
                let kurikulum = if tingkat == 12 { "K13" } else { "MERDEKA" };
                let wali_kelas_id: Option<i64> = match rombel_idx {
                    4 => Some(1),  // XI RPL 1 -> Budi
                    16 => Some(2), // XII TKJ 1 -> Siti
                    _ => None,
                };
                sqlx::query(
                    r#"
                    INSERT INTO rombels (id, tingkat, major_id, academic_year_id, kurikulum_acuan, nama_rombel, wali_kelas_id)
                    VALUES (?, ?, ?, 1, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      kurikulum_acuan = VALUES(kurikulum_acuan),
                      wali_kelas_id = VALUES(wali_kelas_id)
                    "#,
                )
                .bind(rombel_idx)
                .bind(tingkat)
                .bind(major_id)
                .bind(kurikulum)
                .bind(&nama_rombel)
                .bind(wali_kelas_id)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    // 10. BK Class Assignments (18 rombels distributed across 5 BK counselors)
    let bk_rombel_map = [
        (1_i64, 1_i64, 4_i64),  // Hendra -> XI RPL 1
        (2, 1, 16),             // Hendra -> XII TKJ 1
        (3, 1, 5),              // Hendra -> XI RPL 2
        (4, 2, 1),              // Fitri -> X RPL 1
        (5, 2, 2),              // Fitri -> X RPL 2
        (6, 2, 3),              // Fitri -> X RPL 3
        (7, 3, 10),             // Rahmat -> X TKJ 1
        (8, 3, 11),             // Rahmat -> X TKJ 2
        (9, 3, 12),             // Rahmat -> X TKJ 3
        (10, 4, 6),             // Dewi -> XI RPL 3
        (11, 4, 13),            // Dewi -> XI TKJ 1
        (12, 4, 14),            // Dewi -> XI TKJ 2
        (13, 5, 15),            // Ilham -> XI TKJ 3
        (14, 5, 7),             // Ilham -> XII RPL 1
        (15, 5, 8),             // Ilham -> XII RPL 2
        (16, 5, 9),             // Ilham -> XII RPL 3
        (17, 4, 17),            // Dewi -> XII TKJ 2
        (18, 3, 18),            // Rahmat -> XII TKJ 3
    ];
    for (id, bk_id, rombel_id) in bk_rombel_map {
        sqlx::query(
            "INSERT INTO bk_class_assignments (id, bk_id, rombel_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE bk_id = VALUES(bk_id), rombel_id = VALUES(rombel_id)",
        )
        .bind(id)
        .bind(bk_id)
        .bind(rombel_id)
        .execute(&mut *tx)
        .await?;
    }

    // 11. 180 Students (users 29..208 -> students 1..180)
    // First 4 named demo students:
    let featured_students = [
        (1_i64, 29_i64, "Rizky Pratama", "rizky.siswa@smkn1percut.sch.id", "0081234501", "240101", 4_i64, "L", "2008-04-12", "AKTIF"),
        (2, 30, "Aisyah Putri Nasution", "aisyah.siswa@smkn1percut.sch.id", "0081234502", "240102", 4, "P", "2008-08-19", "AKTIF"),
        (3, 31, "Dimas Aditya Siregar", "dimas.siswa@smkn1percut.sch.id", "0079988101", "230201", 16, "L", "2007-02-27", "PKL"),
        (4, 32, "Nadia Safitri Lubis", "nadia.siswa@smkn1percut.sch.id", "0091122301", "250101", 1, "P", "2009-06-03", "AKTIF"),
    ];
    for (sid, uid, nama, email, nisn, nis, rombel_id, jk, tgl, status) in featured_students {
        sqlx::query(
            r#"
            INSERT INTO users (id, nama, email, password_hash, role, status, last_login_at)
            VALUES (?, ?, ?, 'plain:smkn1percut', 'SISWA', 'AKTIF', '2026-11-16 08:12:00')
            ON DUPLICATE KEY UPDATE nama = VALUES(nama)
            "#,
        )
        .bind(uid)
        .bind(nama)
        .bind(email)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'SISWA')")
            .bind(uid)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO students (id, user_id, nisn, nis, rombel_id, jenis_kelamin, tanggal_lahir, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE rombel_id = VALUES(rombel_id), status = VALUES(status)
            "#,
        )
        .bind(sid)
        .bind(uid)
        .bind(nisn)
        .bind(nis)
        .bind(rombel_id)
        .bind(jk)
        .bind(tgl)
        .bind(status)
        .execute(&mut *tx)
        .await?;
    }

    // 38 more students in XI RPL 1 (rombel_id=4, total 40 in XI RPL 1): students 5..42, users 33..70
    for i in 3..=40_i64 {
        let sid = i + 2;
        let uid = sid + 28;
        let is_female = i % 2 == 0;
        let idx = (i as usize) % 10;
        let fname = if is_female { FIRST_NAMES_P[idx] } else { FIRST_NAMES_L[idx] };
        let lname = LAST_NAMES[((i as usize) * 7) % 10];
        let nama = format!("{fname} {lname} {i}");
        let email = format!("siswa.xirpl1.{i}@smkn1percut.sch.id");
        let nisn = format!("0081234{:03}", 500 + i);
        let nis = format!("2401{i:02}");
        let jk = if is_female { "P" } else { "L" };

        sqlx::query(
            r#"
            INSERT INTO users (id, nama, email, password_hash, role, status, last_login_at)
            VALUES (?, ?, ?, 'plain:smkn1percut', 'SISWA', 'AKTIF', '2026-11-16 07:55:00')
            ON DUPLICATE KEY UPDATE nama = VALUES(nama)
            "#,
        )
        .bind(uid)
        .bind(&nama)
        .bind(&email)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'SISWA')")
            .bind(uid)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO students (id, user_id, nisn, nis, rombel_id, jenis_kelamin, tanggal_lahir, status)
            VALUES (?, ?, ?, ?, 4, ?, '2008-05-15', 'AKTIF')
            ON DUPLICATE KEY UPDATE rombel_id = VALUES(rombel_id)
            "#,
        )
        .bind(sid)
        .bind(uid)
        .bind(&nisn)
        .bind(&nis)
        .bind(jk)
        .execute(&mut *tx)
        .await?;
    }

    // 138 remaining students across the other 17 rombels: students 43..180, users 71..208
    let other_rombels: [i64; 17] = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    let mut xii_tkj_pkl_students: Vec<i64> = vec![3]; // Dimas first
    for seq in 1..=138_i64 {
        let sid = 42 + seq;
        let uid = 70 + seq;
        let target_rombel = other_rombels[((seq - 1) as usize) % other_rombels.len()];
        let is_female = seq % 2 == 0;
        let idx = (seq as usize) % 10;
        let fname = if is_female { FIRST_NAMES_P[idx] } else { FIRST_NAMES_L[idx] };
        let lname = LAST_NAMES[((seq as usize) * 3) % 10];
        let nama = format!("{fname} {lname} S{seq}");
        let email = format!("siswa.gen.{seq}@smkn1percut.sch.id");
        let nisn = format!("0089000{seq:03}");
        let nis = format!("25{seq:04}");
        let jk = if is_female { "P" } else { "L" };
        let is_grade_12 = matches!(target_rombel, 7 | 8 | 9 | 16 | 17 | 18);
        let tgl = if is_grade_12 { "2007-03-10" } else { "2009-02-14" };
        let stu_status = if target_rombel == 16 && seq <= 90 { "PKL" } else { "AKTIF" };
        if (target_rombel == 16 || target_rombel == 17) && xii_tkj_pkl_students.len() < 10 {
            xii_tkj_pkl_students.push(sid);
        }

        sqlx::query(
            r#"
            INSERT INTO users (id, nama, email, password_hash, role, status, last_login_at)
            VALUES (?, ?, ?, 'plain:smkn1percut', 'SISWA', 'AKTIF', '2026-11-15 09:00:00')
            ON DUPLICATE KEY UPDATE nama = VALUES(nama)
            "#,
        )
        .bind(uid)
        .bind(&nama)
        .bind(&email)
        .execute(&mut *tx)
        .await?;

        sqlx::query("INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'SISWA')")
            .bind(uid)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO students (id, user_id, nisn, nis, rombel_id, jenis_kelamin, tanggal_lahir, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE rombel_id = VALUES(rombel_id), status = VALUES(status)
            "#,
        )
        .bind(sid)
        .bind(uid)
        .bind(&nisn)
        .bind(&nis)
        .bind(target_rombel)
        .bind(jk)
        .bind(tgl)
        .bind(stu_status)
        .execute(&mut *tx)
        .await?;
    }

    // 12. Subjects (1..10)
    let subjects = [
        (1_i64, "MTK", "Matematika", "UMUM"),
        (2, "BIND", "Bahasa Indonesia", "UMUM"),
        (3, "BING", "Bahasa Inggris", "UMUM"),
        (4, "INF", "Informatika", "UMUM"),
        (5, "PKK", "Projek Kreatif & Kewirausahaan", "UMUM"),
        (6, "PWB", "Pemrograman Web & Perangkat Bergerak", "KEJURUAN"),
        (7, "BSD", "Basis Data & SQL", "KEJURUAN"),
        (8, "ASJ", "Administrasi Sistem Jaringan", "KEJURUAN"),
        (9, "PKL", "Praktik Kerja Lapangan", "PKL"),
        (10, "UKK", "Uji Kompetensi Keahlian", "UKK"),
    ];
    for (id, kode, nama, kelompok) in subjects {
        sqlx::query(
            "INSERT INTO subjects (id, kode, nama, kelompok) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE nama = VALUES(nama), kelompok = VALUES(kelompok)",
        )
        .bind(id)
        .bind(kode)
        .bind(nama)
        .bind(kelompok)
        .execute(&mut *tx)
        .await?;
    }

    // 13. Teacher Assignments (1..6)
    let teacher_assignments = [
        (1_i64, 1_i64, 1_i64, 4_i64, "MERDEKA", 4_i32),  // Budi -> MTK XI RPL 1
        (2, 1, 6, 4, "MERDEKA", 6),                       // Budi -> PWB XI RPL 1
        (3, 1, 1, 1, "MERDEKA", 4),                       // Budi -> MTK X RPL 1
        (4, 2, 1, 16, "K13", 4),                          // Siti -> MTK XII TKJ 1
        (5, 2, 8, 16, "K13", 6),                          // Siti -> ASJ XII TKJ 1
        (6, 3, 1, 5, "MERDEKA", 4),                       // Darmawan -> MTK XI RPL 2
    ];
    for (id, teacher_id, subject_id, rombel_id, track, jp) in teacher_assignments {
        sqlx::query(
            r#"
            INSERT INTO teacher_assignments (id, teacher_id, subject_id, rombel_id, academic_year_id, semester, kurikulum_acuan, jam_per_minggu, status)
            VALUES (?, ?, ?, ?, 1, 'GENAP', ?, ?, 'AKTIF')
            ON DUPLICATE KEY UPDATE kurikulum_acuan = VALUES(kurikulum_acuan), jam_per_minggu = VALUES(jam_per_minggu)
            "#,
        )
        .bind(id)
        .bind(teacher_id)
        .bind(subject_id)
        .bind(rombel_id)
        .bind(track)
        .bind(jp)
        .execute(&mut *tx)
        .await?;
    }

    // 14. Learning Modules (1..3)
    let modules = [
        (
            1_i64,
            1_i64,
            "Matriks & Transformasi Geometri untuk Grafika Komputer",
            "Capaian Pembelajaran (Fase F): Peserta didik mampu memodelkan transformasi geometri bidang (translasi, refleksi, rotasi, dilatasi) menggunakan operasi matriks 2x2 untuk aplikasi pemrograman grafika 2D.\n\n1. Konsep Matriks Transformasi\nSetiap titik P(x, y) dapat direpresentasikan sebagai vektor kolom dan ditransformasikan melalui perkalian matriks M * P.\n\n2. Latihan Refleksi\nTuliskan satu contoh kasus rotasi sprite game sebesar 90 derajat berlawanan arah jarum jam.",
        ),
        (
            2,
            2,
            "Arsitektur Type-Safe REST API & Backend Rust (Axum + SQLx)",
            "TP: Peserta didik merancang endpoint REST dengan kontrak tipe eksplisit (Result<T, E>, algebraic enum) agar layanan backend Rust (Axum + SQLx) berjalan aman.\n\nLangkah Praktikum:\n1. Definisikan tipe Request & Response dengan validasi ketat.\n2. Pisahkan domain murni (lms-domain) dari layer HTTP & MySQL.",
        ),
        (
            3,
            4,
            "KD 3.28: Statistika Deskriptif & Analisis Trafik Jaringan",
            "KI/KD (K13 Revisi): Menganalisis ukuran pemusatan dan penyebaran data paket jaringan sekolah.",
        ),
    ];
    for (id, ta_id, judul, konten) in modules {
        sqlx::query(
            "INSERT INTO modules (id, teacher_assignment_id, judul, konten, status) VALUES (?, ?, ?, ?, 'PUBLISHED') ON DUPLICATE KEY UPDATE judul = VALUES(judul), konten = VALUES(konten)",
        )
        .bind(id)
        .bind(ta_id)
        .bind(judul)
        .bind(konten)
        .execute(&mut *tx)
        .await?;
    }

    // 15. Sessions (1..3)
    let sessions = [
        (1_i64, 1_i64, 1_i32, "2026-11-16", "07:30", "23:59", "TEORI", "Matriks Transformasi 2D pada Layar Koordinat (Sesi Uji 40 Siswa)", 1_i64, 60_i32, "OPEN"),
        (2, 2, 1, "2026-11-16", "07:30", "23:59", "PRAKTIK", "Validasi Input & Algebraic Error Handling", 2, 50, "OPEN"),
        (3, 4, 1, "2026-11-16", "08:00", "10:00", "TEORI", "Statistika Deskriptif (K13)", 3, 60, "CLOSED"),
    ];
    for (id, ta_id, ke, tgl, mulai, selesai, tipe, topik, mod_id, min_pct, status) in sessions {
        sqlx::query(
            r#"
            INSERT INTO sessions (id, teacher_assignment_id, pertemuan_ke, tanggal, jam_mulai, jam_selesai, tipe_sesi, topik, module_id, minimum_read_pct, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE topik = VALUES(topik), status = VALUES(status)
            "#,
        )
        .bind(id)
        .bind(ta_id)
        .bind(ke)
        .bind(tgl)
        .bind(mulai)
        .bind(selesai)
        .bind(tipe)
        .bind(topik)
        .bind(mod_id)
        .bind(min_pct)
        .bind(status)
        .execute(&mut *tx)
        .await?;
    }

    // 16. Attendance Records (Aisyah HADIR in ses-1)
    sqlx::query(
        r#"
        INSERT INTO attendance_records
          (id, session_id, student_id, status, aktivitas_minimum_terpenuhi, read_pct, submitted_task, submitted_reflection, diakses_pada, diaktifkan_pada)
        VALUES
          (1, 1, 2, 'HADIR', TRUE, 100, FALSE, TRUE, '2026-11-16 08:05:00', '2026-11-16 08:10:00')
        ON DUPLICATE KEY UPDATE status = VALUES(status), read_pct = VALUES(read_pct)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 17. Assignments & Submissions
    sqlx::query(
        r#"
        INSERT INTO assignments (id, session_id, teacher_assignment_id, judul, deskripsi, deadline, tipe, rubrik)
        VALUES
          (1, 1, 1, 'LKPD 1: Perhitungan Matriks Rotasi 2D', 'Hitung koordinat bayangan segitiga ABC setelah dirotasi 90 derajat terhadap titik asal O(0,0). Sertakan langkah perkalian matriks.', '2026-11-20 23:59:00', 'TUGAS', 'Ketepatan rumus (40%), Langkah perhitungan (40%), Kerapian penulisan (20%).'),
          (2, 2, 2, 'Praktikum 1: Skema Result<T, E> untuk Endpoint Nilai', 'Tuliskan struktur tipe error untuk endpoint input nilai agar tidak mengembalikan null tanpa pesan.', '2026-11-21 23:59:00', 'PRAKTIK', 'Kelengkapan varian error (50%), Kejelasan pesan (50%).')
        ON DUPLICATE KEY UPDATE judul = VALUES(judul)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO submissions (id, assignment_id, student_id, file_url, teks, submitted_at, nilai, dinilai_oleh, catatan_guru)
        VALUES
          (1, 1, 2, NULL, 'Diketahui A(2,1), B(4,1), C(4,4). Matriks rotasi 90 = [[0,-1],[1,0]]. Hasil: A''(-1,2), B''(-1,4), C''(-4,4).', '2026-11-16 09:12:00', 92.00, 1, 'Langkah perkalian matriks sangat rapi dan tepat.')
        ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 18. Notebooks & Entries
    sqlx::query(
        r#"
        INSERT INTO notebooks (id, student_id, subject_id, teacher_assignment_id)
        VALUES
          (1, 1, 1, 1),
          (2, 2, 1, 1)
        ON DUPLICATE KEY UPDATE subject_id = VALUES(subject_id)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO notebook_entries (id, notebook_id, judul, konten, gambar_url, komentar_guru, created_at, updated_at)
        VALUES
          (1, 1, 'Catatan Pertemuan 1: Matriks Rotasi', 'Rumus rotasi berlawanan jarum jam 90 derajat: x'' = -y, y'' = x. Perlu latihan lagi untuk sudut 45 derajat.', NULL, 'Bagus Rizky, coba kerjakan soal nomor 3 untuk sudut 45 derajat.', '2026-11-16 08:30:00', '2026-11-16 08:45:00'),
          (2, 2, 'Ringkasan Transformasi Komposisi', 'Urutan perkalian matriks komposisi dibaca dari kanan ke kiri: T2 * T1 * P.', NULL, NULL, '2026-11-16 08:35:00', '2026-11-16 08:35:00')
        ON DUPLICATE KEY UPDATE judul = VALUES(judul)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 19. Grade Components, Grades, Final Grades, e-Rapor Column Mapping
    let components = [
        (1_i64, 1_i64, "FORMATIF", Decimal::new(3000, 2)),
        (2, 1, "SUMATIF", Decimal::new(4000, 2)),
        (3, 1, "PRAKTIK", Decimal::new(3000, 2)),
        (4, 1, "REMEDIAL", Decimal::new(0, 2)),
        (5, 4, "FORMATIF", Decimal::new(4000, 2)),
        (6, 4, "SUMATIF", Decimal::new(6000, 2)),
    ];
    for (id, ta_id, nama, bobot) in components {
        sqlx::query(
            "INSERT INTO grade_components (id, teacher_assignment_id, nama, bobot) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE bobot = VALUES(bobot)",
        )
        .bind(id)
        .bind(ta_id)
        .bind(nama)
        .bind(bobot)
        .execute(&mut *tx)
        .await?;
    }

    let grades = [
        (1_i64, 1_i64, 1_i64, 1_i64, Decimal::new(8400, 2), "Aktif bertanya di kelas"),
        (2, 1, 1, 2, Decimal::new(8000, 2), "Sumatif lingkup materi 1"),
        (3, 1, 1, 3, Decimal::new(8800, 2), "Praktik koordinat"),
        (4, 2, 1, 1, Decimal::new(9200, 2), "Sangat konsisten"),
        (5, 2, 1, 2, Decimal::new(9000, 2), "Nilai sumatif tinggi"),
        (6, 2, 1, 3, Decimal::new(9400, 2), "Laporan lengkap"),
    ];
    for (id, stu_id, ta_id, comp_id, nilai, catatan) in grades {
        sqlx::query(
            "INSERT INTO grades (id, student_id, teacher_assignment_id, component_id, nilai, catatan) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai), catatan = VALUES(catatan)",
        )
        .bind(id)
        .bind(stu_id)
        .bind(ta_id)
        .bind(comp_id)
        .bind(nilai)
        .bind(catatan)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO final_grades (id, student_id, teacher_assignment_id, nilai_akhir, predikat)
        VALUES
          (1, 1, 1, 83.60, 'Cakap'),
          (2, 2, 1, 91.80, 'Mahir')
        ON DUPLICATE KEY UPDATE nilai_akhir = VALUES(nilai_akhir), predikat = VALUES(predikat)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let erapor_mapping_json = json!([
        { "erapor_column": "NISN", "system_field": "nisn" },
        { "erapor_column": "Nama Peserta Didik", "system_field": "nama_siswa" },
        { "erapor_column": "Rombel", "system_field": "nama_rombel" },
        { "erapor_column": "Nilai Rapor", "system_field": "nilai_akhir" },
        { "erapor_column": "Predikat", "system_field": "predikat" },
        { "erapor_column": "Deskripsi Capaian Kompetensi", "system_field": "deskripsi_capaian" }
    ]);
    sqlx::query(
        r#"
        INSERT INTO erapor_column_mappings (id, academic_year_id, mapel_id, template_name, mapping_json, created_by)
        VALUES (1, 1, NULL, 'Format Impor e-Rapor SMK Kemendikdasmen v7.0', ?, 1)
        ON DUPLICATE KEY UPDATE template_name = VALUES(template_name), mapping_json = VALUES(mapping_json)
        "#,
    )
    .bind(erapor_mapping_json)
    .execute(&mut *tx)
    .await?;

    // 20. CBT Question Bank, Questions, Exams, Exam Sessions, Exam Answers
    sqlx::query(
        r#"
        INSERT INTO question_banks (id, subject_id, teacher_id, judul, kurikulum_acuan)
        VALUES (1, 1, 1, 'Bank Soal Transformasi & Matriks XI RPL', 'MERDEKA')
        ON DUPLICATE KEY UPDATE judul = VALUES(judul)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO questions (id, bank_id, tipe, stem, options_json, jawaban_json, rubrik, skor, level_kognitif)
        VALUES
          (1, 1, 'PG', 'Bayangan titik P(3, -2) jika ditranslasikan oleh T(4, 5) adalah...', ?, ?, 'x'' = 3+4 = 7, y'' = -2+5 = 3', 50.00, 'C2'),
          (2, 1, 'PG', 'Jika titik A(2, 5) dicerminkan terhadap sumbu X, maka koordinat bayangannya adalah...', ?, ?, 'Refleksi sumbu X membalik tanda y menjadi -y', 50.00, 'C2')
        ON DUPLICATE KEY UPDATE stem = VALUES(stem), skor = VALUES(skor)
        "#,
    )
    .bind(json!(["A. (7, 3)", "B. (-1, -7)", "C. (7, -7)", "D. (1, 3)"]))
    .bind(json!("A. (7, 3)"))
    .bind(json!(["A. (-2, 5)", "B. (2, -5)", "C. (-2, -5)", "D. (5, 2)"]))
    .bind(json!("B. (2, -5)"))
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO exams (id, teacher_assignment_id, tipe, judul, waktu_mulai, durasi_menit, token, status, parent_exam_id, target_student_ids_json)
        VALUES
          (1, 1, 'MID', 'STS Genap Matematika XI RPL 1', '2026-11-16 08:00:00', 90, 'RPL2026', 'AKTIF', NULL, NULL),
          (2, 2, 'CUSTOM', 'Kuis Praktik API Backend XI RPL 1', '2026-11-17 10:00:00', 60, 'WEB110', 'TERJADWAL', NULL, NULL)
        ON DUPLICATE KEY UPDATE judul = VALUES(judul), token = VALUES(token)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO exam_sessions (id, exam_id, student_id, status, started_at, finished_at, tab_switch_count)
        VALUES (1, 1, 2, 'SELESAI', '2026-11-16 08:02:00', '2026-11-16 08:40:00', 0)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO exam_answers (id, exam_session_id, question_id, jawaban_json, skor, disimpan_pada)
        VALUES
          (1, 1, 1, ?, 50.00, '2026-11-16 08:15:00'),
          (2, 1, 2, ?, 50.00, '2026-11-16 08:35:00')
        ON DUPLICATE KEY UPDATE skor = VALUES(skor)
        "#,
    )
    .bind(json!("A. (7, 3)"))
    .bind(json!("B. (2, -5)"))
    .execute(&mut *tx)
    .await?;

    // 21. PKL: 2 DUDIs, 2 PKS, 10 Placements, Journals, Scores, Mapel Contribution
    sqlx::query(
        r#"
        INSERT INTO dudis (id, nama, alamat, bidang, kontak)
        VALUES
          (1, 'PT Telkom Indonesia Witel Medan', 'Jl. Prof. HM. Yamin No. 13, Medan', 'Telekomunikasi & Jaringan Fiber Optik', 'humas.medan@telkom.co.id'),
          (2, 'CV Nusantara Digital Solution', 'Jl. Williem Iskandar No. 45, Deli Serdang', 'Pengembangan Perangkat Lunak', 'hrd@nusantaradigital.id')
        ON DUPLICATE KEY UPDATE bidang = VALUES(bidang), kontak = VALUES(kontak)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO pks_documents (id, dudi_id, nomor, tanggal_mulai, tanggal_selesai, file_url)
        VALUES
          (1, 1, 'PKS/SMKN1PST/2026/014', '2026-01-10', '2026-12-31', 'https://arsip.smkn1percut.sch.id/pks/telkom-2026.pdf'),
          (2, 2, 'PKS/SMKN1PST/2026/022', '2026-02-01', '2026-12-31', 'https://arsip.smkn1percut.sch.id/pks/nusantara-2026.pdf')
        ON DUPLICATE KEY UPDATE file_url = VALUES(file_url)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    for (idx, stu_id) in xii_tkj_pkl_students.iter().enumerate() {
        let plc_id = (idx + 1) as i64;
        let dudi_id = if idx < 5 { 1_i64 } else { 2_i64 };
        let pks_id = dudi_id;
        let pembimbing_dudi = if idx < 5 {
            "Ir. Andi Syahputra"
        } else {
            "Robby Kurniawan, S.T"
        };
        sqlx::query(
            r#"
            INSERT INTO pkl_placements (id, student_id, dudi_id, pks_id, pembimbing_bk_id, pembimbing_dudi_nama, periode_mulai, periode_selesai, status)
            VALUES (?, ?, ?, ?, 1, ?, '2026-07-01', '2026-12-15', 'BERJALAN')
            ON DUPLICATE KEY UPDATE pembimbing_dudi_nama = VALUES(pembimbing_dudi_nama)
            "#,
        )
        .bind(plc_id)
        .bind(*stu_id)
        .bind(dudi_id)
        .bind(pks_id)
        .bind(pembimbing_dudi)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO pkl_journals (id, placement_id, tanggal, aktivitas, validasi_bk, catatan_bk)
        VALUES
          (1, 1, '2026-11-15', 'Melakukan terminasi kabel fiber optik ODP dan pengukuran redaman OTDR di area Percut.', TRUE, 'Aktivitas sesuai kompetensi TKJ.'),
          (2, 1, '2026-11-16', 'Konfigurasi VLAN switch distribusi dan dokumentasi topologi pelanggan korporat.', FALSE, '')
        ON DUPLICATE KEY UPDATE aktivitas = VALUES(aktivitas)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    let pkl_scores = [
        (1_i64, 1_i64, "DUDI_HARD", Decimal::new(8800, 2)),
        (2, 1, "DUDI_SOFT", Decimal::new(9000, 2)),
        (3, 1, "DUDI_DISIPLIN", Decimal::new(9200, 2)),
        (4, 1, "SEKOLAH_LAPORAN", Decimal::new(8500, 2)),
    ];
    for (id, plc_id, komp, nilai) in pkl_scores {
        sqlx::query(
            "INSERT INTO pkl_scores (id, placement_id, komponen, nilai, dinilai_oleh) VALUES (?, ?, ?, ?, 24) ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)",
        )
        .bind(id)
        .bind(plc_id)
        .bind(komp)
        .bind(nilai)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query(
        r#"
        INSERT INTO mapel_pkl_contributions (id, student_id, subject_id, nilai, guru_id, catatan)
        VALUES (1, 3, 8, 89.00, 2, 'Nilai kontribusi proyek konfigurasi server saat PKL (terpisah dari nilai PKL BK).')
        ON DUPLICATE KEY UPDATE nilai = VALUES(nilai)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // 22. Prompt Templates (4 templates) & Teacher Documents (2)
    let tpl_1_inputs = json!([
        { "key": "topik", "label": "Topik / Elemen Kompetensi", "placeholder": "Misal: Pembuatan REST API Type-Safe", "required": true },
        { "key": "model_pembelajaran", "label": "Model Pembelajaran", "placeholder": "Project-Based Learning (PjBL)", "required": true },
        { "key": "dimensi_profil", "label": "Dimensi Profil Pelajar Pancasila", "placeholder": "Bernalar Kritis, Mandiri, Gotong Royong", "required": false }
    ]);
    let tpl_1_check = json!([
        "CP, TP, dan ATP sesuai fase SMK telah tercantum",
        "KKTP dan rubrik asesmen unjuk kerja terukur",
        "Tidak mengandung data pribadi siswa (NISN/nama)",
        "Alokasi waktu sesuai jadwal minggu efektif"
    ]);
    sqlx::query(
        r#"
        INSERT INTO prompt_templates (id, kode, nama, kategori, kurikulum_acuan, input_schema_json, template_body, output_structure, validation_checklist_json, version, status)
        VALUES (
          1,
          'MODUL-AJAR-MERDEKA-KEJURUAN',
          'Modul Ajar Kurikulum Merdeka (Mapel Kejuruan SMK)',
          'KEJURUAN',
          'MERDEKA',
          ?,
          'Susun Modul Ajar SMK Kurikulum Merdeka untuk:\n- Sekolah: {{nama_sekolah}} (NPSN {{npsn}})\n- Mata Pelajaran: {{mapel}}\n- Konsentrasi Keahlian: {{jurusan}}\n- Kelas / Fase: {{kelas}} / {{fase}} ({{jumlah_siswa}} siswa)\n- Tahun Ajaran / Semester: {{tahun_ajaran}} / {{semester}}\n- Kurikulum Acuan: {{kurikulum_acuan}}\n- Alokasi Waktu: {{alokasi_jp}}\n- Guru Pengampu: {{nama_guru}} (NIP {{nip_guru}})\n\nFokus Materi:\n- Topik: {{topik}}\n- Model Pembelajaran: {{model_pembelajaran}}\n- Dimensi Profil: {{dimensi_profil}}',
          '1. Informasi Umum & CP/TP/ATP\n2. Kriteria Ketercapaian Tujuan Pembelajaran (KKTP)\n3. Skenario Praktik Bengkel/Lab (Pendahuluan, Inti PjBL, Penutup)\n4. Asesmen Diagnostik, Formatif, Sumatif & Rubrik Unjuk Kerja',
          ?,
          2,
          'AKTIF'
        )
        ON DUPLICATE KEY UPDATE template_body = VALUES(template_body), validation_checklist_json = VALUES(validation_checklist_json)
        "#,
    )
    .bind(tpl_1_inputs)
    .bind(tpl_1_check)
    .execute(&mut *tx)
    .await?;

    let tpl_2_inputs = json!([
        { "key": "topik", "label": "Materi Pokok & KD", "placeholder": "Misal: KD 3.28 Statistika Deskriptif", "required": true },
        { "key": "model_pembelajaran", "label": "Metode Pembelajaran", "placeholder": "Discovery Learning", "required": true }
    ]);
    let tpl_2_check = json!([
        "KI dan KD K13 Revisi sudah sesuai",
        "Indikator Pencapaian Kompetensi (IPK) lengkap",
        "Instrumen penilaian pengetahuan dan keterampilan tersedia"
    ]);
    sqlx::query(
        r#"
        INSERT INTO prompt_templates (id, kode, nama, kategori, kurikulum_acuan, input_schema_json, template_body, output_structure, validation_checklist_json, version, status)
        VALUES (
          2,
          'RPP-K13-UMUM',
          'RPP K13 Revisi (Mapel Umum)',
          'UMUM',
          'K13',
          ?,
          'Susun RPP K13 Revisi 1 Lembar untuk:\n- Sekolah: {{nama_sekolah}}\n- Mata Pelajaran: {{mapel}}\n- Kelas / Jurusan: {{kelas}} / {{jurusan}}\n- Kurikulum: {{kurikulum_acuan}}\n- Alokasi: {{alokasi_jp}}\n- Guru: {{nama_guru}}\n- Materi Pokok & KD: {{topik}}\n- Metode: {{model_pembelajaran}}',
          '1. Kompetensi Inti (KI) & Kompetensi Dasar (KD)\n2. Tujuan Pembelajaran\n3. Langkah Pembelajaran (Pendahuluan, Inti, Penutup)\n4. Penilaian Pengetahuan & Keterampilan',
          ?,
          1,
          'AKTIF'
        )
        ON DUPLICATE KEY UPDATE template_body = VALUES(template_body), validation_checklist_json = VALUES(validation_checklist_json)
        "#,
    )
    .bind(tpl_2_inputs)
    .bind(tpl_2_check)
    .execute(&mut *tx)
    .await?;

    let tpl_3_inputs = json!([
        { "key": "topik", "label": "Fokus Capaian Industri", "placeholder": "Misal: Kompetensi Teknisi Fiber Optic", "required": true }
    ]);
    let tpl_3_check = json!([
        "Selaras dengan MoU/PKS DUDI",
        "Komponen penilaian DUDI dan sekolah terpisah jelas"
    ]);
    sqlx::query(
        r#"
        INSERT INTO prompt_templates (id, kode, nama, kategori, kurikulum_acuan, input_schema_json, template_body, output_structure, validation_checklist_json, version, status)
        VALUES (
          3,
          'PANDUAN-PKL-SMK',
          'Program & Jurnal Pembimbingan PKL',
          'PKL',
          'BOTH',
          ?,
          'Susun Panduan Pembimbingan PKL untuk {{nama_sekolah}} jurusan {{jurusan}} dengan fokus {{topik}} pada kurikulum {{kurikulum_acuan}}.',
          '1. Capaian PKL di DUDI\n2. Format Logbook Harian\n3. Rubrik DUDI & Sekolah',
          ?,
          1,
          'AKTIF'
        )
        ON DUPLICATE KEY UPDATE template_body = VALUES(template_body), validation_checklist_json = VALUES(validation_checklist_json)
        "#,
    )
    .bind(tpl_3_inputs)
    .bind(tpl_3_check)
    .execute(&mut *tx)
    .await?;

    let tpl_4_inputs = json!([
        { "key": "topik", "label": "Skema Okupasi / Unit Kompetensi", "placeholder": "Misal: Pemrogram Junior (SKKNI)", "required": true }
    ]);
    let tpl_4_check = json!([
        "Mengacu skema SKKNI / LSP P1",
        "Kriteria unjuk kerja (KUK) terverifikasi"
    ]);
    sqlx::query(
        r#"
        INSERT INTO prompt_templates (id, kode, nama, kategori, kurikulum_acuan, input_schema_json, template_body, output_structure, validation_checklist_json, version, status)
        VALUES (
          4,
          'PERANGKAT-UKK-SMK',
          'Perangkat Uji Kompetensi Keahlian (UKK)',
          'UKK',
          'BOTH',
          ?,
          'Susun Lembar Penilaian UKK untuk {{nama_sekolah}} jurusan {{jurusan}} skema {{topik}}.',
          '1. Daftar Unit Kompetensi\n2. Skenario Uji Praktik\n3. Rubrik Kompeten/Belum Kompeten',
          ?,
          1,
          'AKTIF'
        )
        ON DUPLICATE KEY UPDATE template_body = VALUES(template_body), validation_checklist_json = VALUES(validation_checklist_json)
        "#,
    )
    .bind(tpl_4_inputs)
    .bind(tpl_4_check)
    .execute(&mut *tx)
    .await?;

    let doc1_check = json!({
        "CP, TP, dan ATP sesuai fase SMK telah tercantum": true,
        "KKTP dan rubrik asesmen unjuk kerja terukur": true,
        "Tidak mengandung data pribadi siswa (NISN/nama)": true,
        "Alokasi waktu sesuai jadwal minggu efektif": true
    });
    let doc2_check = json!({
        "KI dan KD K13 Revisi sudah sesuai": true
    });
    sqlx::query(
        r#"
        INSERT INTO teacher_documents (id, teacher_assignment_id, template_id, judul, konten, generated_prompt, status, generated_at, pasted_at, published_at, validation_json)
        VALUES
          (1, 2, 1, 'Modul Ajar PjBL Type-Safe REST API XI RPL 1', 'Modul Ajar lengkap dengan CP/TP/ATP/KKTP untuk kelas XI RPL 1 telah disusun dan divalidasi.', 'Prompt ter-generate untuk XI RPL 1', 'PUBLISHED', '2026-11-10 09:00:00', '2026-11-10 09:20:00', '2026-11-10 09:30:00', ?),
          (2, 4, 2, 'RPP Statistika XII TKJ 1 (Belum Publish)', 'Draft awal RPP K13 Statistika Deskriptif.', 'Prompt K13 untuk XII TKJ 1', 'DRAFT', '2026-11-12 11:00:00', '2026-11-12 11:15:00', NULL, ?)
        ON DUPLICATE KEY UPDATE judul = VALUES(judul), status = VALUES(status)
        "#,
    )
    .bind(doc1_check)
    .bind(doc2_check)
    .execute(&mut *tx)
    .await?;

    // 23. Notifications, Audit Logs, Import Batches, Coaching Notes, Walikelas Notes, Settings
    sqlx::query(
        r#"
        INSERT INTO notifications (id, user_id, tipe, judul, pesan, entitas, entitas_id, dibaca_at, created_at)
        VALUES
          (1, 5, 'PERINGATAN', 'Kelengkapan Perangkat Ajar Belum Publish', 'RPP K13 untuk XII TKJ 1 masih berstatus DRAFT. Mohon lengkapi checklist validasi dan publish sebelum akhir pekan.', 'teacher_documents', '2', NULL, '2026-11-15 14:00:00'),
          (2, 29, 'AKADEMIK', 'Sesi Matematika Pertemuan 1 Dibuka', 'Pak Budi Santoso membuka sesi "Matriks Transformasi 2D". Penuhi aktivitas minimum agar tercatat HADIR.', 'sessions', '1', NULL, '2026-11-16 07:35:00')
        ON DUPLICATE KEY UPDATE judul = VALUES(judul)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO audit_logs (id, user_id, aksi, entitas, entitas_id, after_json, ip, user_agent, created_at)
        VALUES
          (1, 4, 'OPEN_SESSION', 'sessions', '1', ?, '127.0.0.1', 'rust-seed', '2026-11-16 07:30:00'),
          (2, 30, 'SESSION_ACTIVITY_HADIR', 'attendance_records', '1', ?, '127.0.0.1', 'rust-seed', '2026-11-16 08:10:00')
        ON DUPLICATE KEY UPDATE aksi = VALUES(aksi)
        "#,
    )
    .bind(json!({ "detail": "Membuka sesi pertemuan ke-1 Matematika XI RPL 1 (07:30-23:59)" }))
    .bind(json!({ "detail": "Siswa memenuhi aktivitas minimum (100% baca modul + refleksi) -> HADIR" }))
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO import_batches (id, tipe, file_url, status, total_baris, baris_sukses, baris_error, error_log_json, created_by, created_at)
        VALUES (1, 'SISWA', 'dapodik_siswa_xi_rpl_2026.csv', 'SELESAI', 40, 40, 0, ?, 1, '2026-11-01 08:00:00')
        ON DUPLICATE KEY UPDATE file_url = VALUES(file_url)
        "#,
    )
    .bind(json!([]))
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO coaching_notes (id, author_user_id, target_type, target_id, judul, catatan, created_at)
        VALUES
          (1, 24, 'SISWA', 1, 'Pemantauan Kedisiplinan Tugas Awal Semester', 'Siswa aktif di buku tulis, perlu pendampingan ketepatan waktu pengumpulan LKPD 1.', '2026-11-15 13:00:00'),
          (2, 2, 'GURU', 2, 'Supervisi Administrasi Perangkat Ajar K13', 'RPP XII TKJ 1 masih DRAFT; wakasek telah mengirim pengingat tindak lanjut.', '2026-11-15 15:00:00')
        ON DUPLICATE KEY UPDATE judul = VALUES(judul)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO walikelas_notes (id, student_id, catatan)
        VALUES
          (1, 1, 'Menunjukkan minat kuat pada pemrograman backend. Tingkatkan ketelitian pada latihan matriks.'),
          (2, 2, 'Sangat konsisten dalam kehadiran dan penyelesaian tugas tepat waktu.')
        ON DUPLICATE KEY UPDATE catatan = VALUES(catatan)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO settings (`key`, `value`, `group`)
        VALUES
          ('school_npsn', '10214029', 'school'),
          ('dual_track_policy', 'Permendikdasmen-13-2025', 'curriculum'),
          ('backup_retention_days', '7', 'system')
        ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)
        "#,
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(())
}
