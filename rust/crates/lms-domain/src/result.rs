use serde::Serialize;
use thiserror::Error;

pub type DomainResult<T> = Result<T, DomainError>;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExamConflict {
    pub student_id: String,
    pub student_name: String,
    pub rombel_name: String,
    pub conflicting_exam_id: String,
    pub conflicting_exam_title: String,
    pub overlap_start: String,
    pub overlap_end: String,
}

#[derive(Debug, Error, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind")]
pub enum DomainError {
    #[error("{message}")]
    #[serde(rename = "FORBIDDEN")]
    Forbidden {
        #[serde(rename = "httpStatus")]
        http_status: u16,
        message: String,
        #[serde(rename = "requiredCapability")]
        required_capability: String,
    },

    #[error("Entitas {entity} dengan id {id} tidak ditemukan.")]
    #[serde(rename = "NOT_FOUND")]
    NotFound {
        #[serde(rename = "httpStatus")]
        http_status: u16,
        entity: String,
        id: String,
    },

    #[error("{message}")]
    #[serde(rename = "VALIDATION_ERROR")]
    ValidationError {
        #[serde(rename = "httpStatus")]
        http_status: u16,
        field: String,
        message: String,
    },

    #[error("{message}")]
    #[serde(rename = "EXAM_OVERLAP")]
    ExamOverlap {
        #[serde(rename = "httpStatus")]
        http_status: u16,
        message: String,
        conflicts: Vec<ExamConflict>,
    },

    #[error("{message}")]
    #[serde(rename = "CONFLICT")]
    Conflict {
        #[serde(rename = "httpStatus")]
        http_status: u16,
        message: String,
    },
}

impl DomainError {
    pub fn http_status(&self) -> u16 {
        match self {
            DomainError::Forbidden { http_status, .. } => *http_status,
            DomainError::NotFound { http_status, .. } => *http_status,
            DomainError::ValidationError { http_status, .. } => *http_status,
            DomainError::ExamOverlap { http_status, .. } => *http_status,
            DomainError::Conflict { http_status, .. } => *http_status,
        }
    }

    pub fn forbidden(message: impl Into<String>, required_capability: impl Into<String>) -> Self {
        Self::Forbidden {
            http_status: 403,
            message: message.into(),
            required_capability: required_capability.into(),
        }
    }

    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self::Forbidden {
            http_status: 401,
            message: message.into(),
            required_capability: "AUTH:LOGIN".to_string(),
        }
    }

    pub fn validation(field: impl Into<String>, message: impl Into<String>) -> Self {
        Self::ValidationError {
            http_status: 422,
            field: field.into(),
            message: message.into(),
        }
    }

    pub fn not_found(entity: impl Into<String>, id: impl Into<String>) -> Self {
        Self::NotFound {
            http_status: 404,
            entity: entity.into(),
            id: id.into(),
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict {
            http_status: 409,
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Conflict {
            http_status: 500,
            message: message.into(),
        }
    }
}

pub fn assert_never<T>(context: &str) -> DomainResult<T> {
    Err(DomainError::internal(format!(
        "State domain tidak terduga (assert_never): {context}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_http_statuses_accurately() {
        assert_eq!(DomainError::unauthorized("Unauth").http_status(), 401);
        assert_eq!(DomainError::forbidden("Deny", "CAP").http_status(), 403);
        assert_eq!(DomainError::not_found("user", "1").http_status(), 404);
        assert_eq!(DomainError::conflict("Dup").http_status(), 409);
        assert_eq!(DomainError::validation("nama", "Kosong").http_status(), 422);
    }

    #[test]
    fn assert_never_returns_500_domain_error() {
        let err: DomainResult<()> = assert_never("invalid_variant");
        assert_eq!(err.unwrap_err().http_status(), 500);
    }
}
