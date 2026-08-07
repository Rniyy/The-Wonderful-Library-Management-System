'use strict';

/**
 * A deliberately small router so the project has zero npm dependencies —
 * clone it and `node server.js` just works, no install step, nothing to
 * go stale. Supports :params, JSON bodies, and JSON error responses.
 */
class Router {
  constructor() {
    this.routes = []; // { method, segments, handler }
  }

  _add(method, path, handler) {
    const segments = path.split('/').filter(Boolean);
    this.routes.push({ method, segments, handler });
  }

  get(path, handler) { this._add('GET', path, handler); }
  post(path, handler) { this._add('POST', path, handler); }
  put(path, handler) { this._add('PUT', path, handler); }
  delete(path, handler) { this._add('DELETE', path, handler); }

  _match(method, urlPath) {
    const reqSegments = urlPath.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== reqSegments.length) continue;

      const params = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const rSeg = route.segments[i];
        const seg = reqSegments[i];
        if (rSeg.startsWith(':')) {
          params[rSeg.slice(1)] = decodeURIComponent(seg);
        } else if (rSeg !== seg) {
          matched = false;
          break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  async handle(req, res, urlPath) {
    const match = this._match(req.method, urlPath);
    if (!match) return false;

    req.params = match.params;

    try {
      req.body = await this._readBody(req);
    } catch (err) {
      sendJson(res, 400, { error: 'Malformed JSON body.' });
      return true;
    }

    try {
      await match.handler(req, res);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      const message = err && err.message ? err.message : 'Internal server error.';
      sendJson(res, status, { error: message });
    }
    return true;
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      if (req.method === 'GET' || req.method === 'DELETE') return resolve({});
      const contentType = req.headers['content-type'] || '';
      if (!contentType.includes('application/json')) return resolve({});

      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

module.exports = { Router, sendJson };
