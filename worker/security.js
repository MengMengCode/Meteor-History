const encoder = new TextEncoder();

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, owner, repo) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${String(owner).toLowerCase()}\n${String(repo).toLowerCase()}`),
  );
  return base64Url(new Uint8Array(signature));
}

export function createWorkerSigner(secret = '') {
  const key = typeof secret === 'string' ? secret : '';
  return {
    enabled: Boolean(key),
    sign: (owner, repo) => key ? hmac(key, owner, repo) : Promise.resolve(''),
    async verify(owner, repo, signature) {
      if (!key) return true;
      if (typeof signature !== 'string') return false;
      return (await hmac(key, owner, repo)) === signature;
    },
  };
}

function hostMatches(host, pattern) {
  if (pattern.startsWith('*.')) return host === pattern.slice(2) || host.endsWith(`.${pattern.slice(2)}`);
  return host === pattern;
}

export function hotlinkAllowed(request, allowedHosts = [], enabled = true) {
  if (!enabled) return true;
  const referer = request.headers.get('referer');
  if (!referer) return true;
  try {
    const requestHost = new URL(request.url).hostname.toLowerCase();
    const refererHost = new URL(referer).hostname.toLowerCase();
    return refererHost === requestHost || allowedHosts.some((pattern) => hostMatches(refererHost, pattern));
  } catch {
    return false;
  }
}

export async function rateLimit(binding, request, route) {
  if (!binding) return true;
  const client = request.headers.get('cf-connecting-ip') || 'unknown';
  const result = await binding.limit({ key: `${route}:${client}` });
  return result.success;
}
