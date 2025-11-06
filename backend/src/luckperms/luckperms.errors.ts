export type LuckpermsExternalError = {
  type: 'EXTERNAL_UNAVAILABLE';
  dep: 'LUCKPERMS_DB';
  stage: 'DNS' | 'CONNECT' | 'AUTH' | 'QUERY';
  message: string;
  safeMessage: string;
  cause?: string;
};

export type LuckpermsUnexpectedError = {
  type: 'UNEXPECTED';
  safeMessage: string;
  cause?: unknown;
};

export type LuckpermsErrorDetail =
  | LuckpermsExternalError
  | LuckpermsUnexpectedError;

export class LuckpermsError extends Error {
  constructor(public readonly detail: LuckpermsErrorDetail) {
    super(detail.safeMessage);
  }
}

export function externalError(
  stage: LuckpermsExternalError['stage'],
  message: string,
  cause?: string,
): LuckpermsError {
  return new LuckpermsError({
    type: 'EXTERNAL_UNAVAILABLE',
    dep: 'LUCKPERMS_DB',
    stage,
    message,
    cause,
    safeMessage: 'LuckPerms 数据库暂时不可用，请稍后再试或联系管理员',
  });
}

export function unexpectedError(
  message: string,
  cause?: unknown,
): LuckpermsError {
  return new LuckpermsError({
    type: 'UNEXPECTED',
    safeMessage: message,
    cause,
  });
}
