/**
 * Rust-inspired algebraic Result<T, E> and exhaustive matching utilities.
 * Maps 1:1 to Rust `std::result::Result<T, DomainError>`.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(res: Result<T, E>): res is Ok<T> {
  return res.ok;
}

export function isErr<T, E>(res: Result<T, E>): res is Err<E> {
  return !res.ok;
}

export function mapResult<T, U, E>(
  res: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return res.ok ? ok(fn(res.value)) : res;
}

export function andThen<T, U, E>(
  res: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return res.ok ? fn(res.value) : res;
}

export function assertNever(value: never, context = 'Unexpected variant'): never {
  throw new Error(`${context}: ${JSON.stringify(value)}`);
}

export type DomainError =
  | {
      readonly kind: 'UNAUTHORIZED';
      readonly httpStatus: 401;
      readonly message: string;
    }
  | {
      readonly kind: 'FORBIDDEN';
      readonly httpStatus: 403;
      readonly message: string;
      readonly requiredCapability?: string;
    }
  | {
      readonly kind: 'NOT_FOUND';
      readonly httpStatus: 404;
      readonly entity: string;
      readonly id: string;
      readonly message?: string;
    }
  | {
      readonly kind: 'VALIDATION_ERROR';
      readonly httpStatus: 422;
      readonly field: string;
      readonly message: string;
    }
  | {
      readonly kind: 'EXAM_OVERLAP';
      readonly httpStatus: 409;
      readonly message: string;
      readonly conflicts: ReadonlyArray<{
        readonly studentId: string;
        readonly studentName: string;
        readonly rombelName: string;
        readonly conflictingExamId: string;
        readonly conflictingExamTitle: string;
        readonly overlapStart: string;
        readonly overlapEnd: string;
      }>;
    }
  | {
      readonly kind: 'CONFLICT';
      readonly httpStatus: 409;
      readonly message: string;
    };

export function forbiddenError(
  message: string,
  requiredCapability: string,
): DomainError {
  return {
    kind: 'FORBIDDEN',
    httpStatus: 403,
    message,
    requiredCapability,
  };
}

export function validationError(field: string, message: string): DomainError {
  return {
    kind: 'VALIDATION_ERROR',
    httpStatus: 422,
    field,
    message,
  };
}

export function notFoundError(entity: string, id: string): DomainError {
  return {
    kind: 'NOT_FOUND',
    httpStatus: 404,
    entity,
    id,
  };
}
