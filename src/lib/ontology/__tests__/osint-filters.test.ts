import { describe, it, expect } from "vitest";
import { checkIoc, filterL1, filterL2, isValidIpv4 } from "../../../../supabase/functions/_shared/osint-filters";

describe("OSINT identifier hygiene", () => {
  it("rejects IPv4 with an octet above 255", () => {
    expect(isValidIpv4("312.45.7.19")).toBe(false);
    expect(checkIoc("312.45.7.19")).toEqual({ ok: false, reason: "malformed" });
  });
  it("marks public DNS 8.8.8.8 as benign", () => {
    expect(checkIoc("8.8.8.8")).toEqual({ ok: false, reason: "benign" });
  });
  it("marks Cloudflare 1.1.1.1 as benign", () => {
    expect(checkIoc("1.1.1.1")).toEqual({ ok: false, reason: "benign" });
  });
  it("accepts an ordinary routable IP", () => {
    expect(checkIoc("45.77.12.9").ok).toBe(true);
  });
  it("rejects a 33-character hash, accepts a 64-character hash", () => {
    expect(checkIoc("a".repeat(33)).ok).toBe(false);
    expect(checkIoc("a".repeat(64)).ok).toBe(true);
  });
  it("rejects malformed CVE-2023-99 and future-year CVE-2099-48213", () => {
    expect(checkIoc("CVE-2023-99")).toEqual({ ok: false, reason: "malformed" });
    expect(checkIoc("CVE-2099-48213", 2026)).toEqual({ ok: false, reason: "implausible" });
    expect(checkIoc("CVE-2024-3400", 2026).ok).toBe(true);
  });
  it("marks update.microsoft.com as benign", () => {
    expect(checkIoc("update.microsoft.com")).toEqual({ ok: false, reason: "benign" });
  });
});

describe("L1 / L2 entity filters", () => {
  it("L1 drops KB-hallucinated names and keeps T1486", () => {
    const r = filterL1([{ name: "T1999.042", type: "ttp" }, { name: "Data Encrypted for Impact", type: "ttp", mitre_id: "T1486" }], new Set(["t1999042"]));
    expect(r.kept.map((e) => e.name)).toEqual(["Data Encrypted for Impact"]);
  });
  it("L2 drops entities below confidence 0.4", () => {
    expect(filterL2([{ name: "X", type: "malware", confidence: 0.39 }], [], 0.75).kept).toHaveLength(0);
  });
  it("L2 drops weakly supported actor from reliability 0.5 source with confidence < 0.6", () => {
    const r = filterL2([{ name: "ShadowKraken Team", type: "threat_actor", confidence: 0.5 }], [{ source: "ShadowKraken Team", target: "x" }], 0.5);
    expect(r.dropped[0].reason).toBe("R11_R8_unsupported_attribution");
  });
  it("L2 keeps the same actor from a reliable source", () => {
    expect(filterL2([{ name: "APT29", type: "threat_actor", confidence: 0.5 }], [], 0.75).kept).toHaveLength(1);
  });
});

describe("CVE token inside a longer name", () => {
  it("keeps 'CVE-2020-11651_Exploitation' (valid CVE with suffix)", () => {
    expect(filterL1([{ name: "CVE-2020-11651_Exploitation", type: "ttp" }], new Set()).kept).toHaveLength(1);
  });
  it("still drops 'CVE-2023-99 exploit'", () => {
    expect(filterL1([{ name: "CVE-2023-99 exploit", type: "ttp" }], new Set()).kept).toHaveLength(0);
  });
});
