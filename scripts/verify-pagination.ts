/**
 * Verifies PaginationDto validation the same way Nest's ValidationPipe does:
 * transform query string values -> validate -> inspect errors.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationDto } from '../src/common/dto/pagination.dto';

async function run(name: string, query: Record<string, any>) {
  const dto = plainToInstance(PaginationDto, query);
  const errors = await validate(dto);
  if (errors.length === 0) {
    console.log(`${name.padEnd(22)} -> OK  (page=${dto.page}, limit=${dto.limit})`);
  } else {
    const msgs = errors.flatMap((e) => Object.values(e.constraints || {}));
    console.log(`${name.padEnd(22)} -> 400 ${JSON.stringify(msgs)}`);
  }
}

(async () => {
  await run('no params (defaults)', {});
  await run('limit=5', { limit: '5' });
  await run('limit=200 (over cap)', { limit: '200' });
  await run('limit=abc (not int)', { limit: 'abc' });
  await run('page=0 (below min)', { page: '0' });
})();
