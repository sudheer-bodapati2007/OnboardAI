// src/tests/api.retry.test.js
// Unit tests for the transport-level transient retry helper used by aiApi.chat.
//
// Production context: Render free-tier services idle-spin-down and wake slowly;
// the first AI request after idle can fail with "Network Error" or the proxy
// can return an error page. One safe automatic retry (only for transient
// statuses and fast failures) recovers from that without leaving the user
// staring at an error, while permanent errors (401/400/404/422) never retry.

import { describe, it, expect } from 'vitest';
import { withTransientRetry, AI_TIMEOUT_MS } from '../services/api.js';

describe('withTransientRetry', () => {
  it('retries once on 503 and returns the successful result', async () => {
    let calls = 0;
    const result = await withTransientRetry(
      () => {
        calls++;
        if (calls === 1) throw { message: 'Service Unavailable', status: 503 };
        return 'ok';
      },
      { retries: 1, delayMs: 0 }
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('retries on 429, 502 and 504', async () => {
    for (const status of [429, 502, 504]) {
      let calls = 0;
      await withTransientRetry(
        () => {
          calls++;
          if (calls === 1) throw { message: 'transient', status };
          return 'ok';
        },
        { retries: 1, delayMs: 0 }
      );
      expect(calls).toBe(2);
    }
  });

  it('retries network errors (no response / no status)', async () => {
    let calls = 0;
    const result = await withTransientRetry(
      () => {
        calls++;
        if (calls === 1) throw { message: 'Network Error', status: undefined, code: 'ERR_NETWORK' };
        return 'recovered';
      },
      { retries: 1, delayMs: 0 }
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });

  it('never retries permanent errors (400/401/403/404/422)', async () => {
    for (const status of [400, 401, 403, 404, 422]) {
      let calls = 0;
      await expect(
        withTransientRetry(
          () => {
            calls++;
            throw { message: 'permanent', status };
          },
          { retries: 1, delayMs: 0 }
        )
      ).rejects.toMatchObject({ status });
      expect(calls).toBe(1);
    }
  });

  it('does not auto-retry a slow first attempt (user retries manually instead)', async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        () => {
          calls++;
          if (calls === 1) throw { message: 'timeout of 90000ms exceeded', status: undefined, code: 'ECONNABORTED' };
          return 'ok';
        },
        { retries: 1, delayMs: 0, fastRetryWindowMs: 0 } // zero window = attempt counts as slow
      )
    ).rejects.toMatchObject({ code: 'ECONNABORTED' });
    expect(calls).toBe(1);
  });

  it('gives up after exhausting retries', async () => {
    let calls = 0;
    await expect(
      withTransientRetry(
        () => {
          calls++;
          throw { message: 'Service Unavailable', status: 503 };
        },
        { retries: 1, delayMs: 0 }
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toBe(2);
  });

  it('exposes the AI timeout constant above the global 15s', () => {
    expect(AI_TIMEOUT_MS).toBeGreaterThan(15000);
  });
});
