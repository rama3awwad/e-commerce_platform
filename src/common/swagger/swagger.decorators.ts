import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiResponse,
  getSchemaPath,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiExtraModels,
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
    ApiExtraModels(model),
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
    ApiExtraModels(model),
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
              unreadCount: { type: 'number', example: 3, description: 'Present on notifications lists' },
            },
          },
        },
        required: ['items', 'meta'],
      }),
    }),
  );

export const ApiArraySuccessResponse = (model: Type, description = 'Successful response') =>
  applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({ description, schema: envelopeSchema({ type: 'array', items: { $ref: getSchemaPath(model) } }) }),
  );

/**
 * Documents an error response following the global exception filter format:
 * { statusCode, code, message, error, details?, timestamp, path }
 */
export const ApiErrorResponse = (
  status:
    | 400
    | 401
    | 403
    | 404
    | 409
    | 429
    | 503
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
        code: { type: 'string', example: status === 400 ? 'VALIDATION_ERROR' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : status === 429 ? 'TOO_MANY_REQUESTS' : status === 503 ? 'INVENTORY_UNAVAILABLE' : 'INTERNAL_ERROR' },
        message: Array.isArray(messageExample)
          ? { type: 'array', items: { type: 'string' }, example: messageExample }
          : { type: 'string', example: messageExample },
        error: { type: 'string', example: errorName },
        details: { type: 'array', items: { type: 'object' }, nullable: true },
        timestamp: {
          type: 'string',
          format: 'date-time',
          example: '2026-10-27T12:00:00.000Z',
        },
        path: { type: 'string', example: '/api/v1/endpoint' },
      },
      required: ['statusCode', 'code', 'message', 'error', 'timestamp', 'path'],
    },
  });
