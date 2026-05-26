/**
 * Federated sensitivity resolvers.
 * Four adapters share one interface. Wikidata/GeoneNames/LCSH adapters are
 * stub-cached against JSON fixtures (no live HTTPS — simulation only).
 * The `local` adapter handles project-specific exceptions in-memory.
 */
import { LRUCache } from "./cache";
import wikidata from "./fixtures/wikidata.json";
import geonames from "./fixtures/geonames.json";
import lcsh from "./fixtures/lcsh.json";

export interface ResolverResult {
  source: "wikidata" | "geonames" | "lcsh" | "local";
  hit: boolean;
  data: Record<string, unknown>;
}

export interface Resolver {
  name: string;
  lookup(term: string, kind?: string): Promise<ResolverResult>;
}

const cache = new LRUCache<string, ResolverResult>(512);
const k = (source: string, term: string) => `${source}::${term.toLowerCase()}`;

export const wikidataResolver: Resolver = {
  name: "wikidata",
  async lookup(term) {
    const ck = k("wikidata", term);
    const cached = cache.get(ck);
    if (cached) return cached;
    const hit = (wikidata as Record<string, unknown>)[term];
    const res: ResolverResult = {
      source: "wikidata", hit: !!hit, data: (hit as Record<string, unknown>) ?? {},
    };
    cache.set(ck, res);
    return res;
  },
};

export const geonamesResolver: Resolver = {
  name: "geonames",
  async lookup(term) {
    const ck = k("geonames", term);
    const cached = cache.get(ck);
    if (cached) return cached;
    const hit = (geonames as Record<string, unknown>)[term];
    const res: ResolverResult = {
      source: "geonames", hit: !!hit, data: (hit as Record<string, unknown>) ?? {},
    };
    cache.set(ck, res);
    return res;
  },
};

export const lcshResolver: Resolver = {
  name: "lcsh",
  async lookup(term) {
    const ck = k("lcsh", term.toLowerCase());
    const cached = cache.get(ck);
    if (cached) return cached;
    const hit = (lcsh as Record<string, unknown>)[term.toLowerCase()];
    const res: ResolverResult = {
      source: "lcsh", hit: !!hit, data: (hit as Record<string, unknown>) ?? {},
    };
    cache.set(ck, res);
    return res;
  },
};

/** Project / community gazetteer — kept in-memory, hot-reload via UI. */
const localTable = new Map<string, Record<string, unknown>>([
  ["sweat lodge", { cultural_flag: "ceremonial" }],
  ["potlatch", { cultural_flag: "ceremonial" }],
  ["songline", { cultural_flag: "restricted" }],
  ["Thomas Brennan", { relative_of_living: true }],
]);

export const localResolver: Resolver = {
  name: "local",
  async lookup(term) {
    const hit = localTable.get(term);
    return { source: "local", hit: !!hit, data: hit ?? {} };
  },
};

export const allResolvers: Resolver[] = [wikidataResolver, geonamesResolver, lcshResolver, localResolver];

/** Federated lookup — collect all adapter results into one object. */
export async function federatedLookup(term: string) {
  const results = await Promise.all(allResolvers.map(r => r.lookup(term)));
  return {
    term,
    wikidata: results[0],
    geonames: results[1],
    lcsh: results[2],
    local: results[3],
    anyHit: results.some(r => r.hit),
  };
}

export type FederatedResult = Awaited<ReturnType<typeof federatedLookup>>;
