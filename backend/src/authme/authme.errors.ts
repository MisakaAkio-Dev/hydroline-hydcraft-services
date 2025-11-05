export type ExternalDependencyError = {
  type: 'EXTERNAL_UNAVAILABLE';
  dep: 'AUTHME_DB';
  stage: 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY';
  message: string;
  safeMessage: string;
  cause?: string;
};

export type BusinessValidationError = {
  type: 'BUSINESS_VALIDATION_FAILED';
  code:
    | 'AUTHME_ACCOUNT_NOT_FOUND'
    | 'AUTHME_PASSWORD_MISMATCH'
    | 'BINDING_CONFLICT'
    | 'AUTHME_EMAIL_REQUIRED'
    | 'AUTHME_NOT_BOUND';
  safeMessage: string;
};

export type UnexpectedError = {
  type: 'UNEXPECTED';
  safeMessage: string;
  cause?: unknown;
};

export type AuthmeErrorDetail =
  | ExternalDependencyError
  | BusinessValidationError
  | UnexpectedError;

export class AuthmeError extends Error {
  constructor(public readonly detail: AuthmeErrorDetail) {
    super(detail.safeMessage);
  }
}

export function externalError(
  stage: ExternalDependencyError['stage'],
  message: string,
  cause?: string,
): AuthmeError {
  return new AuthmeError({
    type: 'EXTERNAL_UNAVAILABLE',
    dep: 'AUTHME_DB',
    stage,
    message,
    cause,
    safeMessage: 'AuthMe 数据库暂时不可用，请稍后再试或改用其它登录方式',
  });
}

export function businessError(detail: BusinessValidationError): AuthmeError {
  return new AuthmeError(detail);
}

export function unexpectedError(message: string, cause?: unknown): AuthmeError {
  return new AuthmeError({
    type: 'UNEXPECTED',
    safeMessage: message,
    cause,
  });
}
