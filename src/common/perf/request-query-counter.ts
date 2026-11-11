import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

interface RequestQueryContext {
  queryCount: number;
}

class RequestQueryCounter {
  private readonly storage = new AsyncLocalStorage<RequestQueryContext>();

  readonly middleware = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.PRISMA_QUERY_COUNT_ENABLED !== 'true') {
      next();
      return;
    }

    const context: RequestQueryContext = { queryCount: 0 };
    this.storage.run(context, () => {
      res.once('finish', () => {
        console.log(`[query-count] ${JSON.stringify({
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          queries: context.queryCount,
        })}`);
      });
      next();
    });
  };

  increment(): void {
    const context = this.storage.getStore();
    if (context) context.queryCount++;
  }
}

export const requestQueryCounter = new RequestQueryCounter();

export function proxyPrismaDelegates<T extends object>(
  baseClient: T,
  extendedClient: object,
  delegates: readonly string[],
): T {
  const proxiedProperties = new Set([...delegates, '$transaction']);
  return new Proxy(baseClient, {
    get(target, property, receiver) {
      if (typeof property === 'string' && proxiedProperties.has(property)) {
        const value = Reflect.get(extendedClient, property, extendedClient);
        return typeof value === 'function' ? value.bind(extendedClient) : value;
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
