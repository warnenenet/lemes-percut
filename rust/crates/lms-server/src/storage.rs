use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use lms_domain::DomainError;
use serde::Serialize;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const ALLOWED_CATEGORIES: &[&str] = &["modules", "notebooks", "submissions"];
const ALLOWED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "pdf", "txt", "md", "doc", "docx",
];
const MAX_UPLOAD_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedUploadResult {
    pub category: String,
    pub filename: String,
    pub url: String,
    pub size_bytes: usize,
    pub mime_type: String,
}

pub fn ensure_storage_directories(storage_root: &Path) -> std::io::Result<()> {
    for cat in ALLOWED_CATEGORIES {
        std::fs::create_dir_all(storage_root.join(cat))?;
    }
    Ok(())
}

pub fn save_uploaded_file(
    storage_root: &Path,
    category: &str,
    original_name: &str,
    mime_type: &str,
    base64_data: &str,
) -> Result<SavedUploadResult, DomainError> {
    if !ALLOWED_CATEGORIES.contains(&category) {
        return Err(DomainError::validation(
            "category",
            "Kategori penyimpanan tidak valid (gunakan modules, notebooks, atau submissions).",
        ));
    }

    let base_name = Path::new(original_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("berkas");

    let ext = Path::new(base_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if ext.is_empty() || !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(DomainError::validation(
            "originalName",
            format!("Ekstensi berkas .{ext} tidak diizinkan."),
        ));
    }

    let payload = base64_data
        .split_once(',')
        .map(|(_, rhs)| rhs)
        .unwrap_or(base64_data)
        .trim();

    if payload.is_empty() {
        return Err(DomainError::validation("base64Data", "Konten berkas kosong."));
    }

    let decoded = BASE64_STANDARD.decode(payload).map_err(|_| {
        DomainError::validation("base64Data", "Data base64 berkas tidak valid.")
    })?;

    if decoded.is_empty() || decoded.len() > MAX_UPLOAD_BYTES {
        return Err(DomainError::Conflict {
            http_status: 413,
            message: "Ukuran berkas kosong atau melebihi batas maksimum 5 MB.".into(),
        });
    }

    let stem_raw = Path::new(base_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("berkas");
    let stem: String = stem_raw
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(48)
        .collect();

    let safe_stem = if stem.is_empty() { "berkas" } else { &stem };
    let unique = Uuid::new_v4().simple().to_string();
    let filename = format!("{safe_stem}-{}.{}", &unique[..10], ext);

    let category_dir = storage_root.join(category);
    std::fs::create_dir_all(&category_dir).map_err(|_| {
        DomainError::internal("Gagal menyiapkan direktori penyimpanan.")
    })?;

    let target = category_dir.join(&filename);
    std::fs::write(&target, &decoded).map_err(|_| {
        DomainError::internal("Gagal menulis berkas ke disk server.")
    })?;

    Ok(SavedUploadResult {
        category: category.to_string(),
        filename: filename.clone(),
        url: format!("/api/files/{category}/{filename}"),
        size_bytes: decoded.len(),
        mime_type: mime_type.to_string(),
    })
}

pub fn resolve_stored_file_path(
    storage_root: &Path,
    category: &str,
    filename: &str,
) -> Option<PathBuf> {
    if !ALLOWED_CATEGORIES.contains(&category) {
        return None;
    }
    if filename.is_empty()
        || filename.contains('/')
        || filename.contains('\\')
        || filename.contains("..")
        || filename.contains('\0')
    {
        return None;
    }
    let category_dir = storage_root.join(category).canonicalize().ok()?;
    let candidate = category_dir.join(filename).canonicalize().ok()?;
    if candidate.starts_with(&category_dir) && candidate.is_file() {
        Some(candidate)
    } else {
        None
    }
}
