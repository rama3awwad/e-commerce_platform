import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';


@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (exception.message === 'File too large') { status = HttpStatus.BAD_REQUEST; code = 'IMAGE_TOO_LARGE'; message = 'Uploaded image exceeds the configured size limit'; error = 'Bad Request'; }

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, any>;
        if (code !== 'IMAGE_TOO_LARGE') {
          message = resp.message || exception.message;
          error = resp.error || 'Error';
          code = resp.code || this.codeForStatus(status);
          if (status === HttpStatus.BAD_REQUEST && Array.isArray(message)) code = 'VALIDATION_ERROR';
          details = resp.details;
        }
      } else {
        message = exceptionResponse as string;
        error = exception.message;
        code = this.codeForStatus(status);
      }
    } else if (exception instanceof Error && exception.name === 'MulterError' && (exception as Error & { code?: string }).code === 'LIMIT_FILE_SIZE') {
      status = HttpStatus.BAD_REQUEST;
      code = 'IMAGE_TOO_LARGE';
      message = 'Uploaded image exceeds the configured size limit';
      error = 'Bad Request';
    } else if (isPrismaKnownError(exception)) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'CONFLICT';
        message = 'A record with this value already exists';
        error = 'Conflict';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Requested record was not found';
        error = 'Not Found';
      } else {
        this.logger.error(`Unhandled Prisma error ${exception.code}`, exception.stack);
        status = HttpStatus.INTERNAL_SERVER_ERROR;
      }
    } else if (exception instanceof Error) {
      this.logger.error('Unhandled exception', exception.stack);
      code = this.codeForStatus(status);
    }

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      code,
      message,
      error,
      ...(details !== undefined ? { details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private codeForStatus(status: number): string {
    return ({ 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 429: 'TOO_MANY_REQUESTS' } as Record<number, string>)[status] ?? 'INTERNAL_ERROR';
  }
}

function isPrismaKnownError(e: unknown): e is Error & { code: string; meta?: unknown } {
  return e instanceof Error && e.name === 'PrismaClientKnownRequestError' && typeof (e as any).code === 'string';
}
