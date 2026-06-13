import { describe, it, expect } from "vitest";
import { SAMPLE_FLOWS, type FlowFeatureRecord } from "../flow-samples";

const OPAQUE_REF = /^[A-Za-z0-9_-]{6,64}$/;
const RFC1918 = /\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/;
const MAC = /\b[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}\b/;

/** Thin inline validator covering the rules from spec §8. Will be replaced by a shared validator in Option 2/3. */
function validate(r: FlowFeatureRecord): string[] {
  const errs: string[] = [];
  if (r.schema_version !== "1.0") errs.push("schema_version != 1.0");
  if (!OPAQUE_REF.test(r.asset_ref)) errs.push("asset_ref not opaque");
  if (RFC1918.test(r.asset_ref) || MAC.test(r.asset_ref)) errs.push("asset_ref leaks RFC1918/MAC");
  const m = r.flow_meta;
  if (!(new Date(m.end_ts).getTime() > new Date(m.start_ts).getTime())) errs.push("end_ts <= start_ts");
  if (m.duration_s < 0) errs.push("duration_s negative");
  if (!["tcp", "udp", "icmp", "other"].includes(m.protocol)) errs.push("bad protocol");
  const f = r.features as Record<string, number>;
  if (typeof f.payload_entropy_bits_per_byte !== "number" || f.payload_entropy_bits_per_byte < 0 || f.payload_entropy_bits_per_byte > 8) {
    errs.push("entropy out of [0,8]");
  }
  for (const k of ["fwd_packets", "bwd_packets", "total_bytes_fwd", "total_bytes_bwd", "iat_mean", "iat_std"]) {
    if (typeof f[k] !== "number" || f[k] < 0) errs.push(`${k} missing or negative`);
  }
  if (!r.provenance?.producer_model_id || !r.provenance?.producer_version || !r.provenance?.created_at) {
    errs.push("provenance incomplete");
  }
  if (!r.text_view || r.text_view.length === 0) errs.push("text_view empty");
  return errs;
}

describe("synthetic flow fixtures", () => {
  it("has five samples", () => {
    expect(SAMPLE_FLOWS.length).toBe(5);
  });

  it.each(SAMPLE_FLOWS.map((s, i) => [i, s.record_id, s] as const))(
    "sample #%i (%s) passes the inline §8 validator",
    (_i, _id, sample) => {
      expect(validate(sample)).toEqual([]);
    },
  );

  it("all asset_refs are opaque per §9", () => {
    for (const s of SAMPLE_FLOWS) {
      expect(s.asset_ref).toMatch(OPAQUE_REF);
      expect(s.asset_ref).not.toMatch(RFC1918);
      expect(s.asset_ref).not.toMatch(MAC);
    }
  });

  it("all text_views are non-empty", () => {
    for (const s of SAMPLE_FLOWS) {
      expect(s.text_view.length).toBeGreaterThan(20);
    }
  });

  it("anomaly_score (when present) is in [0,1]", () => {
    for (const s of SAMPLE_FLOWS) {
      const a = s.derived?.anomaly_score;
      if (a != null) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });
});
