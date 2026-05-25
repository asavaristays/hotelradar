import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { jest } from '@jest/globals';
import {
  createApp,
  createFrontendShellMiddleware,
  shouldServeFrontendShell,
} from '../src/app.js';

describe('app frontend serving', () => {
  let frontendDistDir;
  let frontendIndexFile;
  let app;
  const originalEnforceAuth = process.env.ENFORCE_AUTH_TEST;

  beforeAll(async () => {
    frontendDistDir = await fs.mkdtemp(path.join(os.tmpdir(), 'radar-frontend-dist-'));
    frontendIndexFile = path.join(frontendDistDir, 'index.html');
    await fs.writeFile(
      frontendIndexFile,
      '<!doctype html><html><body><div id="root">HotelRADAR Revenue Shell</div></body></html>',
      'utf8',
    );
    app = createApp({
      serveFrontend: true,
      frontendDistDir,
      frontendIndexFile,
    });
  });

  afterAll(async () => {
    if (originalEnforceAuth === undefined) {
      delete process.env.ENFORCE_AUTH_TEST;
    } else {
      process.env.ENFORCE_AUTH_TEST = originalEnforceAuth;
    }
  });

  test('serves the SPA shell for browser navigation routes', async () => {
    expect(
      shouldServeFrontendShell({
        method: 'GET',
        path: '/dashboard',
        headers: { accept: 'text/html' },
      }),
    ).toBe(true);

    const sendFile = jest.fn();
    const next = jest.fn();
    const middleware = createFrontendShellMiddleware(frontendIndexFile);

    await middleware(
      {
        method: 'GET',
        path: '/dashboard',
        headers: { accept: 'text/html' },
      },
      { sendFile },
      next,
    );

    expect(sendFile).toHaveBeenCalledWith(frontendIndexFile);
    expect(next).not.toHaveBeenCalled();
  });

  test('serves the SPA shell for HEAD requests on browser routes', async () => {
    expect(
      shouldServeFrontendShell({
        method: 'HEAD',
        path: '/',
        headers: { accept: 'text/html' },
      }),
    ).toBe(true);

    const sendFile = jest.fn();
    const next = jest.fn();
    const middleware = createFrontendShellMiddleware(frontendIndexFile);

    await middleware(
      {
        method: 'HEAD',
        path: '/',
        headers: { accept: 'text/html' },
      },
      { sendFile },
      next,
    );

    expect(sendFile).toHaveBeenCalledWith(frontendIndexFile);
    expect(next).not.toHaveBeenCalled();
  });

  test('does not replace backend auth routes', async () => {
    expect(
      shouldServeFrontendShell({
        method: 'GET',
        path: '/auth/me',
        headers: { accept: 'text/html' },
      }),
    ).toBe(false);

    const sendFile = jest.fn();
    const next = jest.fn();
    const middleware = createFrontendShellMiddleware(frontendIndexFile);

    await middleware(
      {
        method: 'GET',
        path: '/auth/me',
        headers: { accept: 'text/html' },
      },
      { sendFile },
      next,
    );

    expect(sendFile).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('does not let admin auth swallow the root shell for remote requests', async () => {
    process.env.ENFORCE_AUTH_TEST = 'true';

    const response = await request(app)
      .get('/')
      .set('Host', 'revenue.hotelradar.in')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('Accept', 'text/html');

    expect(response.status).toBe(200);
    expect(response.type).toBe('text/html');
    expect(response.text).toContain('HotelRADAR Revenue Shell');
  });

  test('keeps admin API routes protected for remote requests', async () => {
    process.env.ENFORCE_AUTH_TEST = 'true';

    const response = await request(app)
      .get('/admin/hotels')
      .set('Host', 'revenue.hotelradar.in')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });
});
