'use strict';

const http = require('http');

/**
 * A tiny fetch-like client for exercising the real server in tests.
 * Keeps its own cookie jar per instance so login sessions work naturally —
 * call login() then every subsequent request on the same client carries
 * the session cookie automatically.
 */
class TestClient {
  constructor(port) {
    this.port = port;
    this.cookie = null;
  }

  request(method, path, body) {
    return new Promise((resolve, reject) => {
      const data = body !== undefined ? JSON.stringify(body) : null;
      const headers = { 'Content-Type': 'application/json' };
      if (data) headers['Content-Length'] = Buffer.byteLength(data);
      if (this.cookie) headers.Cookie = this.cookie;

      const req = http.request(
        { host: 'localhost', port: this.port, path, method, headers },
        (res) => {
          const setCookie = res.headers['set-cookie'];
          if (setCookie && setCookie.length > 0) {
            // keep just "name=value", drop the rest of the cookie attributes
            this.cookie = setCookie[0].split(';')[0];
          }
          let raw = '';
          res.on('data', (chunk) => (raw += chunk));
          res.on('end', () => {
            let json = null;
            try {
              json = raw ? JSON.parse(raw) : null;
            } catch {
              // non-JSON response (e.g. static file) — leave json null, caller can use .raw
            }
            resolve({ status: res.statusCode, json, raw });
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  get(path) {
    return this.request('GET', path);
  }
  post(path, body) {
    return this.request('POST', path, body);
  }
  put(path, body) {
    return this.request('PUT', path, body);
  }
  delete(path) {
    return this.request('DELETE', path);
  }
}

module.exports = { TestClient };
