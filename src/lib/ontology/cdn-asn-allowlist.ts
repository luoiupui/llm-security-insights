/**
 * CDN / cloud ASN allow-list loader.
 *
 * Implements the identifier-hygiene table from
 * `public/reports/ontology-corroborated-finding-spec.md` §4.
 *
 * Pure, side-effect-free. IPv4 only in v1.
 */

import allowlistData from "./cdn-asn-allowlist.json";

export type AllowlistKind = "cdn" | "cloud";

export interface AllowlistEntry {
  name: string;
  asn: number;
  kind: AllowlistKind;
  ip_ranges: string[];
}

interface AllowlistFile {
  version: string;
  updated_at: string;
  description?: string;
  entries: AllowlistEntry[];
}

const ALLOWLIST = allowlistData as AllowlistFile;

export function getAllowlist(): AllowlistEntry[] {
  return ALLOWLIST.entries;
}

export function isAllowlistedAsn(asn: number | null | undefined): boolean {
  if (asn == null || !Number.isFinite(asn)) return false;
  return ALLOWLIST.entries.some((e) => e.asn === asn);
}

/** Parse an IPv4 dotted-quad to a 32-bit unsigned integer. Returns null on failure. */
function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]), d = Number(m[4]);
  if ([a, b, c, d].some((n) => n < 0 || n > 255)) return null;
  // >>> 0 forces unsigned
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

/** Parse a CIDR like "10.0.0.0/8" → { base: uint32, mask: uint32 }. Returns null on failure. */
function parseCidr(cidr: string): { base: number; mask: number } | null {
  const [ip, lenStr] = cidr.split("/");
  if (!ip || !lenStr) return null;
  const base = ipv4ToInt(ip);
  const len = Number(lenStr);
  if (base == null || !Number.isInteger(len) || len < 0 || len > 32) return null;
  const mask = len === 0 ? 0 : (~0 << (32 - len)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

export function isAllowlistedIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const n = ipv4ToInt(ip);
  if (n == null) return false;
  for (const e of ALLOWLIST.entries) {
    for (const cidr of e.ip_ranges) {
      const p = parseCidr(cidr);
      if (p && (n & p.mask) >>> 0 === p.base) return true;
    }
  }
  return false;
}

export interface AllowlistVerdict {
  /** Allowed to create an indicator-match edge from this peer. */
  indicator_match: boolean;
  /** Allowed to create a behavioral-match edge from this peer. */
  behavioral_match: boolean;
  /** Which clause of the §4 table fired. */
  reason: "exact_ip_in_allowlist" | "asn_in_allowlist_only" | "not_in_allowlist";
}

/**
 * Implements the §4 table:
 *   exact IP in allow-list  → indicator_match forbidden, behavioral_match allowed
 *   ASN in allow-list, IP not → indicator_match allowed (with note), behavioral_match allowed
 *   neither                  → both allowed
 */
export function allowlistVerdict(
  ip: string | null | undefined,
  asn: number | null | undefined,
): AllowlistVerdict {
  if (isAllowlistedIp(ip)) {
    return { indicator_match: false, behavioral_match: true, reason: "exact_ip_in_allowlist" };
  }
  if (isAllowlistedAsn(asn)) {
    return { indicator_match: true, behavioral_match: true, reason: "asn_in_allowlist_only" };
  }
  return { indicator_match: true, behavioral_match: true, reason: "not_in_allowlist" };
}
