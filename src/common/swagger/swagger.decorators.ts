import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiResponse,
  getSchemaPath,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';

/**
 * Builds the standard response envelope schema:
 * { success: boolean, data: <model>, timestamp: string }
 */
function envelopeSchema(dataSchema: Record<string, any>) {
  return {
    allOf: [
      {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema,
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2026-10-27T12:00:00.000Z',
          },
        },
        required: ['success', 'data', 'timestamp'],
      },
    ],
  };
}

/**
 * Documents a successful response wrapped in the standard envelope.
 * Use for endpoints returning a single object.
 */
export const ApiSuccessResponse = (
  model: Type,
  status: 200 | 201 = 200,
  description = 'Successful response',
) =>
  applyDecorators(
    status === 201
      ? ApiCreatedResponse({
          description,
          schema: envelopeSchema({ $ref: getSchemaPath(model) }),
        })
      : ApiOkResponse({
          description,
          schema: envelopeSchema({ $ref: getSchemaPath(model) }),
        }),
  );

/**
 * Documents a paginated list response wrapped in the standard envelope:
 * { success, data: { items: [...], meta: {...} }, timestamp }
 */
export const ApiPaginatedResponse = (
  model: Type,
  description = 'Paginated response',
) =>
  applyDecorators(
    ApiOkResponse({
      description,
      schema: envelopeSchema({
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: getSchemaPath(model) },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number', example: 42 },
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 10 },
              totalPages: { type: 'number', example: 5 },
              hasNext: { type: 'boolean', example: true },
              hasPrev: { type: 'boolean', example: false },
            },
          },
        },
        required: ['items', 'meta'],
      }),
    }),
  );

/**
 * Documents an error response following the global exception filter format:
 * { statusCode, message, error, timestamp, path }
 */
export const ApiErrorResponse = (
  status:
    | 400
    | 401
    | 403
    | 404
    | 409
    | 429
    | 500,
  description: string,
  messageExample: string | string[],
  errorName: string,
) =>
  ApiResponse({
    status,
    description,
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: status },
        message: Array.isArray(messageExample)
          ? { type: 'array', items: { type: 'string' }, example: messageExample }
          : { type: 'string', example: messageExample },
        error: { type: 'string', example: errorName },
        timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-10-27T12:00:00.000Z',
        },
        path: { type: 'string', example: '/api/v1/endpoint' },
      },
      required: ['statusCode', 'message', 'error', 'timestamp', 'path'],
    },
  });
