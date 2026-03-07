import { parseServerError } from '../../frontend/src/http.js';

function buildResponse({ status = 500, body = '', contentType = 'text/plain' } = {}) {
  return {
    status,
    headers: {
      get(name) {
        if (String(name || '').toLowerCase() === 'content-type') {
          return contentType;
        }
        return null;
      },
    },
    async text() {
      return body;
    },
  };
}

function buildConsumedResponse({ status = 500, contentType = 'text/plain' } = {}) {
  return {
    status,
    headers: {
      get(name) {
        if (String(name || '').toLowerCase() === 'content-type') {
          return contentType;
        }
        return null;
      },
    },
    async text() {
      throw new TypeError("Failed to execute 'text' on 'Response': body stream already read");
    },
  };
}

describe('frontend http parser', () => {
  test('returns safe fallback for html gateway responses', async () => {
    const response = buildResponse({
      status: 502,
      contentType: 'text/html; charset=UTF-8',
      body: '<!DOCTYPE html><html><body>Bad gateway</body></html>',
    });

    const parsed = await parseServerError(response, 'Unable to load dashboard');

    expect(parsed.message).toBe(
      'Unable to load dashboard. Service is temporarily unavailable. Please retry in a minute.',
    );
    expect(parsed.isHtml).toBe(true);
    expect(parsed.message).not.toContain('<!DOCTYPE html>');
  });

  test('preserves structured json api errors', async () => {
    const response = buildResponse({
      status: 451,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Beta legal acceptance required before dashboard access.',
        committedBy: 'user',
        code: 'LEGAL_REQUIRED',
      }),
    });

    const parsed = await parseServerError(response, 'Unable to load dashboard');

    expect(parsed.message).toBe('User Error: Beta legal acceptance required before dashboard access.');
    expect(parsed.code).toBe('LEGAL_REQUIRED');
    expect(parsed.isHtml).toBe(false);
  });

  test('does not surface raw plain-text error bodies', async () => {
    const response = buildResponse({
      status: 500,
      contentType: 'text/plain',
      body: 'upstream exploded with stack trace',
    });

    const parsed = await parseServerError(response, 'Unable to load hotels');

    expect(parsed.message).toBe('Unable to load hotels (HTTP 500).');
    expect(parsed.message).not.toContain('stack trace');
  });

  test('returns safe fallback when response body is already consumed', async () => {
    const response = buildConsumedResponse({
      status: 502,
      contentType: 'text/html',
    });

    const parsed = await parseServerError(response, 'Unable to load dashboard');

    expect(parsed.message).toBe(
      'Unable to load dashboard. Service is temporarily unavailable. Please retry in a minute.',
    );
    expect(parsed.message).not.toContain('body stream already read');
  });
});
