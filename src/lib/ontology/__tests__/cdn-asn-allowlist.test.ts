import { describe, it, expect } from "vitest";
import {
  getAllowlist, isAllowlistedAsn, isAllowlistedIp, allowlistVerdict,
} from "../cdn-asn-allowlist";

describe("CDN/cloud allow-list", () => {
  it("loads non-empty entries with required fields", () => {
    const list = getAllowlist();
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) {
      expect(typeof e.name).toBe("string");
      expect(typeof e.asn).toBe("number");
      expect(e.ip_ranges.length).toBeGreaterThan(0);
    }
  });

  it("isAllowlistedAsn matches known CDN/cloud ASNs", () => {
    expect(isAllowlistedAsn(13335)).toBe(true); // Cloudflare
    expect(isAllowlistedAsn(15169)).toBe(true); // GCP
    expect(isAllowlistedAsn(8075)).toBe(true);  // Azure
    expect(isAllowlistedAsn(64512)).toBe(false); // private ASN range
    expect(isAllowlistedAsn(null)).toBe(false);
    expect(isAllowlistedAsn(NaN)).toBe(false);
  });

  it("isAllowlistedIp matches known Cloudflare and AWS prefixes", () => {
    expect(isAllowlistedIp("1.1.1.1")).toBe(true);           // Cloudflare 1.1.1.0/24
    expect(isAllowlistedIp("104.16.50.10")).toBe(true);       // Cloudflare 104.16.0.0/12
    expect(isAllowlistedIp("8.8.8.8")).toBe(true);            // GCP 8.8.8.0/24
    expect(isAllowlistedIp("203.0.113.4")).toBe(false);       // TEST-NET-3
    expect(isAllowlistedIp("10.0.0.1")).toBe(false);          // private
    expect(isAllowlistedIp("not-an-ip")).toBe(false);
    expect(isAllowlistedIp("")).toBe(false);
  });

  it("allowlistVerdict implements the §4 truth table", () => {
    // exact IP in allow-list → indicator_match forbidden, behavioral allowed
    expect(allowlistVerdict("1.1.1.1", 13335)).toEqual({
      indicator_match: false, behavioral_match: true, reason: "exact_ip_in_allowlist",
    });
    // ASN in allow-list but IP not (e.g. transient AWS IP we don't seed)
    expect(allowlistVerdict("203.0.113.4", 13335)).toEqual({
      indicator_match: true, behavioral_match: true, reason: "asn_in_allowlist_only",
    });
    // Neither in allow-list
    expect(allowlistVerdict("203.0.113.4", 64512)).toEqual({
      indicator_match: true, behavioral_match: true, reason: "not_in_allowlist",
    });
  });
});
