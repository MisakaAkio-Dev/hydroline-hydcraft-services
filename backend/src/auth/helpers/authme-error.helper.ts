import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthmeError } from '../../authme/authme.errors';

export function rethrowAuthmeError(error: unknown): never {
  if (!(error instanceof AuthmeError)) {
    throw error;
  }
  const detail = error.detail;
  if (detail.type === 'EXTERNAL_UNAVAILABLE') {
    throw new ServiceUnavailableException({
      message: detail.safeMessage,
      dep: detail.dep,
      stage: detail.stage,
      cause: detail.cause,
    });
  }
  if (detail.type === 'BUSINESS_VALIDATION_FAILED') {
    throw new BadRequestException({
      message: detail.safeMessage,
      code: detail.code,
    });
  }
  throw new BadRequestException({
    message: detail.safeMessage,
    code: detail.type,
  });
}
