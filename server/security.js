import { createHmac, timingSafeEqual } from 'node:crypto';

export function createEmbedSigner(secret = '') {
  const key = typeof secret === 'string' ? secret : '';
  const sign = (owner, repo) => createHmac('sha256', key).update(`${String(owner).toLowerCase()}\n${String(repo).toLowerCase()}`).digest('base64url');
  return {
    enabled: key.length > 0,
    sign: (owner, repo) => key ? sign(owner, repo) : '',
    verify(owner, repo, signature) {
      if (!key) return true;
      if (typeof signature !== 'string') return false;
      const expected = Buffer.from(sign(owner, repo));
      const received = Buffer.from(signature);
      return expected.length === received.length && timingSafeEqual(expected, received);
    },
  };
}

function hostMatches(host, pattern) {
  if (pattern.startsWith('*.')) return host === pattern.slice(2) || host.endsWith(`.${pattern.slice(2)}`);
  return host === pattern;
}

export function createHotlinkGuard(allowedHosts = []) {
  const patterns = allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean);
  return function hotlinkGuard(req, res, next) {
    if (!patterns.length) return next();
    const referer = req.get('referer');
    // GitHub Camo and other trusted image proxies often omit Referer. Signed
    // URLs remain mandatory in production, so missing Referer is allowed.
    if (!referer) return next();
    try {
      const host = new URL(referer).hostname.toLowerCase();
      if (host === req.hostname.toLowerCase() || patterns.some((pattern) => hostMatches(host, pattern))) return next();
    } catch {
      // Invalid Referer values are rejected below.
    }
    return res.status(403).type('text').send('Image embedding is not allowed from this site');
  };
}

export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  });
  if (!req.path.startsWith('/api/embed/')) {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https://avatars.githubusercontent.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  }
  next();
}
