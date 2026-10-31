// src/config/dns.js
// Central DNS configuration for MongoDB Atlas.
//
// On some Windows setups Node's c-ares resolver inherits 127.0.0.1 from the
// OS. That loopback address is not a real DNS server, so the SRV/TXT lookups
// required by a `mongodb+srv://` URI fail with `querySrv ECONNREFUSED`.
// Pointing c-ares at a public resolver fixes Atlas SRV resolution.
//
// dns.setServers() only affects c-ares based lookups (dns.resolve* and
// dns.Resolver). It does not change the OS resolver used by dns.lookup() or
// outbound HTTP(S) requests, so unrelated DNS operations keep working.
//
// Override the resolver list with DNS_SERVERS (comma-separated) if needed.

import dns from 'node:dns';

export const DEFAULT_DNS_SERVERS = ['8.8.8.8'];

/**
 * Parse a comma-separated DNS server list, falling back to the defaults.
 *
 * @param {string|undefined} value
 * @param {string[]} [fallback]
 * @returns {string[]}
 */
export function parseDnsServers(value, fallback = DEFAULT_DNS_SERVERS) {
  if (typeof value !== 'string') return [...fallback];
  const servers = value
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
  return servers.length > 0 ? servers : [...fallback];
}

/**
 * Atlas SRV records are only needed for mongodb+srv:// URIs.
 *
 * @param {string|undefined} uri
 * @returns {boolean}
 */
export function isSrvMongoUri(uri) {
  return typeof uri === 'string' && uri.startsWith('mongodb+srv://');
}

function sameServers(a, b) {
  return a.length === b.length && a.every((server, i) => server === b[i]);
}

/**
 * Configure the c-ares resolver used for Atlas SRV lookups.
 *
 * Must run before mongoose.connect(). Safe to call more than once: if the
 * resolver already uses the requested servers, nothing is changed.
 *
 * @param {object} [options]
 * @param {string} [options.mongoUri]  Connection string (defaults to env).
 * @param {string[]} [options.servers] Resolver list (defaults to DNS_SERVERS).
 * @param {object} [options.resolver]  Injectable resolver (for tests).
 * @param {object} [options.logger]    Injectable logger (for tests).
 * @returns {{ applied: boolean, changed?: boolean, reason?: string, servers: string[], error?: Error }}
 */
export function configureDns({
  mongoUri = process.env.MONGODB_URI,
  servers = parseDnsServers(process.env.DNS_SERVERS),
  resolver = dns,
  logger = console,
} = {}) {
  // Only touch the resolver when an SRV lookup is actually required.
  if (!isSrvMongoUri(mongoUri)) {
    return { applied: false, reason: 'non-srv-uri', servers: resolver.getServers() };
  }

  const current = resolver.getServers();
  if (sameServers(current, servers)) {
    return { applied: true, changed: false, servers: current };
  }

  try {
    resolver.setServers(servers);
    logger.log(`[dns] Using ${servers.join(', ')} for MongoDB Atlas SRV resolution`);
    return { applied: true, changed: true, servers };
  } catch (err) {
    // Never block startup on DNS configuration; fall back to system resolvers.
    logger.warn(`[dns] Could not set DNS servers (${err.message}); using system resolvers`);
    return { applied: false, reason: 'set-servers-failed', error: err, servers: current };
  }
}
