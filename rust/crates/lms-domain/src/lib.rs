pub mod attendance;
pub mod cbt;
pub mod grading;
pub mod import_validator;
pub mod prompt_engine;
pub mod rbac;
pub mod result;
pub mod types;

pub use result::{assert_never, DomainError, DomainResult, ExamConflict};
