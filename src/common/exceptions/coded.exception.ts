import { HttpException, HttpStatus } from '@nestjs/common';

export class CodedException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown) {
    super({ statusCode: status, code, message, error: HttpStatus[status], ...(details !== undefined ? { details } : {}) }, status);
  }
}
