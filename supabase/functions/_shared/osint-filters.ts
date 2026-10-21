/**
 * OSINT dirty-data filters (live pipeline, v2 of the dirty-data robustness study).
 *
 * Pure, dependency-free so it runs in Deno edge functions and in vitest.
 *  - L1 ontology / identifier hygiene: IPv4 octets, hash length, CVE format + year,
 *    benign infrastructure (public DNS, CDN/cloud prefixes, vendor update domains),
 *    STIX/CTI type vocabulary, KB "hallucinated" IDs.
 *  - L2 symbolic / reliability: R4 confidence floor after reliability weighting,
 *    and R11/R8 weak-support drop for low-reliability attribution.
 * CDN/cloud prefixes are a snapshot of src/lib/ontology/cdn-asn-allowlist.json.
 */

export const CDN_CLOUD_PREFIXES: string[] = ["1.1.1.0/24", "1.0.0.0/24", "104.16.0.0/12", "172.64.0.0/13", "162.158.0.0/15", "23.0.0.0/12", "23.32.0.0/11", "23.64.0.0/14", "104.64.0.0/10", "184.24.0.0/13", "151.101.0.0/16", "199.232.0.0/16", "52.84.0.0/15", "54.182.0.0/16", "54.192.0.0/16", "54.230.0.0/15", "143.204.0.0/16", "3.0.0.0/9", "13.32.0.0/15", "18.32.0.0/11", "52.0.0.0/11", "54.144.0.0/12", "99.78.0.0/16", "8.8.4.0/24", "8.8.8.0/24", "34.64.0.0/10", "35.184.0.0/13", "104.196.0.0/14", "13.64.0.0/11", "20.0.0.0/8", "40.64.0.0/10", "52.96.0.0/12", "104.40.0.0/13"];

export const PUBLIC_DNS = new Set(["8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1", "9.9.9.9", "149.112.112.112", "208.67.222.222", "208.67.220.220"]);
export const BENIGN_DOMAINS = ["microsoft.com", "windowsupdate.com", "google.com", "googleapis.com", "github.com", "cloudflare.com", "amazonaws.com", "akamai.net", "apple.com", "office.com"];

export const CTI_TYPES = new Set(["threat_actor", "malware", "vulnerability", "ttp", "attack_pattern", "tool", "campaign", "infrastructure", "indicator", "identity", "software", "intrusion_set", "location", "course_of_action", "report", "observed_data", "ioc"]);

const MIN_CVE_YEAR = 1999;

export function ipv4Octets(ip: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  return m ? m.slice(1).map(Number) : null;
}

export function isValidIpv4(ip: string): boolean {
  const o = ipv4Octets(ip);
  return !!o && o.every((x) => x >= 0 && x <= 255);
}

function ipToInt(o: number[]): number {
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}

export function inCdnCloud(ip: string): boolean {
  const o = ipv4Octets(ip);
  if (!o || !isValidIpv4(ip)) return false;
  const v = ipToInt(o);
  return CDN_CLOUD_PREFIXES.some((cidr) => {
    const [base, bits] = cidr.split("/");
    const bo = ipv4Octets(base);
    if (!bo) return false;
    const b = Number(bits);
    const mask = b === 0 ? 0 : (~0 << (32 - b)) >>> 0;
    return ((v & mask) >>> 0) === ((ipToInt(bo) & mask) >>> 0);
  });
}

export type IocVerdict = { ok: true } | { ok: false; reason: "malformed" | "benign" | "implausible" };

/** Check one indicator-looking token. Non-indicator tokens return ok. */
export function checkIoc(token: string, nowYear = new Date().getUTCFullYear()): IocVerdict {
  const t = token.trim();
  if (ipv4Octets(t)) {
    if (!isValidIpv4(t)) return { ok: false, reason: "malformed" };
    if (PUBLIC_DNS.has(t) || inCdnCloud(t)) return { ok: false, reason: "benign" };
    return { ok: true };
  }
  if (/^[a-f0-9]{30,}$/i.test(t)) return [32, 40, 64].includes(t.length) ? { ok: true } : { ok: false, reason: "malformed" };
  if (/^cve-/i.test(t)) {
    const m = /^CVE-(\d{4})-\d{4,7}$/i.exec(t);
    if (!m) return { ok: false, reason: "malformed" };
    const y = Number(m[1]);
    if (y < MIN_CVE_YEAR || y > nowYear) return { ok: false, reason: "implausible" };
    return { ok: true };
  }
  const low = t.toLowerCase();
  if (/^[\w.-]+\.[a-z]{2,}$/.test(low) && BENIGN_DOMAINS.some((d) => low === d || low.endsWith("." + d))) return { ok: false, reason: "benign" };
  return { ok: true };
}

const IOC_RE = /(\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[a-f0-9]{30,}\b|\bCVE-[0-9-]*[0-9]|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io)\b)/gi;

/** All indicator-looking tokens in an entity's name / id / value. */
export function iocTokens(e: { name?: string; mitre_id?: string | null; value?: string }): string[] {
  const out: string[] = [];
  for (const s of [e.name, e.mitre_id, e.value]) {
    if (typeof s !== "string") continue;
    for (const m of s.matchAll(IOC_RE)) out.push(m[0]);
  }
  return out;
}

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface DroppedEntity { name: string; type?: string; layer: "L1" | "L2"; reason: string }

/** L1: ontology + KB + identifier hygiene. `hallucinatedNames` = entity names kb-validate flagged. */
export function filterL1<E extends { name?: string; type?: string; mitre_id?: string | null; value?: string }>(
  entities: E[], hallucinatedNames: Set<string>, nowYear?: number,
): { kept: E[]; dropped: DroppedEntity[] } {
  const kept: E[] = [], dropped: DroppedEntity[] = [];
  for (const e of entities) {
    const name = String(e.name ?? "");
    if (hallucinatedNames.has(norm(name))) { dropped.push({ name, type: e.type, layer: "L1", reason: "kb_hallucinated" }); continue; }
    if (e.type && !CTI_TYPES.has(e.type)) { dropped.push({ name, type: e.type, layer: "L1", reason: "type_outside_ontology" }); continue; }
    const bad = iocTokens(e).map((t) => checkIoc(t, nowYear)).find((v) => !v.ok) as { ok: false; reason: string } | undefined;
    if (bad) { dropped.push({ name, type: e.type, layer: "L1", reason: `ioc_${bad.reason}` }); continue; }
    kept.push(e);
  }
  return { kept, dropped };
}

export const CONFIDENCE_FLOOR = 0.4;
export const LOW_RELIABILITY = 0.5;
export const WEAK_ACTOR_CONFIDENCE = 0.6;

/** L2: R4 floor (confidence x reliability-weighted) + R11/R8 weak-support attribution drop. */
export function filterL2<E extends { name?: string; type?: string; confidence?: number }>(
  entities: E[], relations: { source?: string; target?: string }[], sourceReliability: number,
): { kept: E[]; dropped: DroppedEntity[] } {
  const deg = new Map<string, number>();
  for (const r of relations) for (const k of [r.source, r.target]) deg.set(norm(k), (deg.get(norm(k)) ?? 0) + 1);
  const kept: E[] = [], dropped: DroppedEntity[] = [];
  for (const e of entities) {
    const name = String(e.name ?? ""), c = e.confidence ?? 0;
    if (c < CONFIDENCE_FLOOR) { dropped.push({ name, type: e.type, layer: "L2", reason: "R4_confidence_floor" }); continue; }
    const actor = e.type === "threat_actor" || e.type === "intrusion_set";
    if (actor && sourceReliability <= LOW_RELIABILITY && (deg.get(norm(name)) ?? 0) <= 1 && c < WEAK_ACTOR_CONFIDENCE) {
      dropped.push({ name, type: e.type, layer: "L2", reason: "R11_R8_unsupported_attribution" }); continue;
    }
    kept.push(e);
  }
  return { kept, dropped };
}

export const normName = norm;
