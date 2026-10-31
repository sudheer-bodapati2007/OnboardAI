// tests/dns.test.js
// Unit tests for the central DNS configuration used before Mongoose connects
// to MongoDB Atlas. No real DNS calls are made: the resolver is injected.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_DNS_SERVERS,
  configureDns,
  isSrvMongoUri,
  parseDnsServers,
} from '../src/config/dns.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeFakeResolver({ initial = ['127.0.0.1'], fail = false } = {}) {
  const state = { servers: [...initial], setCalls: [] };
  return {
    state,
    getServers: () => [...state.servers],
    setServers: (next) => {
      state.setCalls.push([...next]);
      if (fail) throw new Error('invalid DNS server');
      state.servers = [...next];
    },
  };
}

function makeLogger() {
  const entries = { log: [], warn: [] };
  return {
    entries,
    log: (message) => entries.log.push(message),
    warn: (message) => entries.warn.push(message),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseDnsServers', () => {
  it('defaults to 8.8.8.8 when DNS_SERVERS is not set', () => {
    assert.deepEqual(parseDnsServers(undefined), DEFAULT_DNS_SERVERS);
  });

  it('parses and trims a comma-separated list', () => {
    assert.deepEqual(parseDnsServers('1.1.1.1, 8.8.8.8'), ['1.1.1.1', '8.8.8.8']);
  });

  it('ignores blank entries', () => {
    assert.deepEqual(parseDnsServers(' 8.8.8.8 , '), ['8.8.8.8']);
  });

  it('falls back to defaults when the value is empty', () => {
    assert.deepEqual(parseDnsServers('   '), DEFAULT_DNS_SERVERS);
  });

  it('returns a copy of the fallback so callers cannot mutate it', () => {
    const parsed = parseDnsServers(undefined);
    parsed.push('9.9.9.9');
    assert.deepEqual(DEFAULT_DNS_SERVERS, ['8.8.8.8']);
  });
});

describe('isSrvMongoUri', () => {
  it('detects mongodb+srv:// connection strings', () => {
    assert.equal(isSrvMongoUri('mongodb+srv://user:pass@cluster.mongodb.net/db'), true);
  });

  it('rejects standard mongodb:// connection strings', () => {
    assert.equal(isSrvMongoUri('mongodb://localhost:27017/db'), false);
  });

  it('rejects missing or non-string values', () => {
    assert.equal(isSrvMongoUri(undefined), false);
    assert.equal(isSrvMongoUri(null), false);
    assert.equal(isSrvMongoUri(42), false);
  });
});

describe('configureDns — Atlas SRV connections', () => {
  it('sets 8.8.8.8 by default before an SRV lookup', () => {
    const resolver = makeFakeResolver();
    const logger = makeLogger();

    const result = configureDns({
      mongoUri: 'mongodb+srv://user:pass@cluster.mongodb.net/db',
      resolver,
      logger,
    });

    assert.equal(result.applied, true);
    assert.equal(result.changed, true);
    assert.deepEqual(resolver.state.setCalls, [['8.8.8.8']]);
    assert.deepEqual(resolver.getServers(), ['8.8.8.8']);
    assert.equal(logger.entries.log.length, 1);
    assert.match(logger.entries.log[0], /8\.8\.8\.8/);
  });

  it('honours a custom resolver list', () => {
    const resolver = makeFakeResolver();
    const logger = makeLogger();

    configureDns({
      mongoUri: 'mongodb+srv://cluster.mongodb.net/db',
      servers: ['1.1.1.1', '8.8.8.8'],
      resolver,
      logger,
    });

    assert.deepEqual(resolver.state.setCalls, [['1.1.1.1', '8.8.8.8']]);
  });

  it('does not re-apply servers that are already configured', () => {
    const resolver = makeFakeResolver({ initial: ['8.8.8.8'] });
    const logger = makeLogger();

    const result = configureDns({
      mongoUri: 'mongodb+srv://cluster.mongodb.net/db',
      resolver,
      logger,
    });

    assert.equal(result.applied, true);
    assert.equal(result.changed, false);
    assert.deepEqual(resolver.state.setCalls, []);
    assert.equal(logger.entries.log.length, 0);
  });

  it('never throws when the resolver rejects the server list', () => {
    const resolver = makeFakeResolver({ fail: true });
    const logger = makeLogger();

    const result = configureDns({
      mongoUri: 'mongodb+srv://cluster.mongodb.net/db',
      resolver,
      logger,
    });

    assert.equal(result.applied, false);
    assert.equal(result.reason, 'set-servers-failed');
    assert.ok(result.error instanceof Error);
    assert.deepEqual(result.servers, ['127.0.0.1']);
    assert.equal(logger.entries.warn.length, 1);
    assert.match(logger.entries.warn[0], /invalid DNS server/);
  });
});

describe('configureDns — non-SRV connections', () => {
  it('leaves the resolver untouched for standard mongodb:// URIs', () => {
    const resolver = makeFakeResolver();
    const logger = makeLogger();

    const result = configureDns({
      mongoUri: 'mongodb://localhost:27017/db',
      resolver,
      logger,
    });

    assert.equal(result.applied, false);
    assert.equal(result.reason, 'non-srv-uri');
    assert.deepEqual(resolver.state.setCalls, []);
    assert.deepEqual(resolver.getServers(), ['127.0.0.1']);
    assert.equal(logger.entries.log.length, 0);
    assert.equal(logger.entries.warn.length, 0);
  });

  it('leaves the resolver untouched when MONGODB_URI is missing', () => {
    const resolver = makeFakeResolver();

    const result = configureDns({ mongoUri: undefined, resolver, logger: makeLogger() });

    assert.equal(result.applied, false);
    assert.equal(result.reason, 'non-srv-uri');
    assert.deepEqual(resolver.state.setCalls, []);
  });
});
