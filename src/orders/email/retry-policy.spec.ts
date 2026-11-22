import { decideRetry } from './retry-policy';
import { parseRetryDelays } from '../../common/messaging/messaging.constants';


describe('decideRetry', () => {
  const delays = [30000, 90000];
  it('retries after 30s on the first failure', () => expect(decideRetry(1, delays)).toEqual({ action: 'retry', delayMs: 30000 }));
  it('retries after 90s on the second failure', () => expect(decideRetry(2, delays)).toEqual({ action: 'retry', delayMs: 90000 }));
  it('goes to the dead-letter queue on the third failure', () => expect(decideRetry(3, delays)).toEqual({ action: 'dead' }));
  it('parses RETRY_DELAYS_MS and falls back to the defaults', () => {
    expect(parseRetryDelays('1000, 2000')).toEqual([1000, 2000]);
    expect(parseRetryDelays('abc')).toEqual([30000, 90000]);
    expect(parseRetryDelays(undefined)).toEqual([30000, 90000]);
  });
});