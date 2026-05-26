// Tiny differential-privacy helpers for in-browser simulation.
// Laplace mechanism + utility (relative error) curve generator.

function laplaceNoise(scale: number): number {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

export function privatizeCount(trueCount: number, epsilon: number, sensitivity = 1): number {
  if (epsilon <= 0) return trueCount;
  const scale = sensitivity / epsilon;
  return Math.max(0, trueCount + laplaceNoise(scale));
}

export interface UtilityPoint {
  epsilon: number;
  relativeError: number; // average |noisy - true| / true
  privacyLevel: "very strong" | "strong" | "moderate" | "weak" | "very weak";
}

const labelFor = (eps: number): UtilityPoint["privacyLevel"] =>
  eps <= 0.1 ? "very strong" :
  eps <= 0.5 ? "strong" :
  eps <= 1 ? "moderate" :
  eps <= 4 ? "weak" : "very weak";

export function utilityCurve(
  trueCounts: number[],
  epsilons: number[] = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8],
  samples = 50,
): UtilityPoint[] {
  return epsilons.map((eps) => {
    let totalRel = 0;
    let n = 0;
    for (const c of trueCounts) {
      if (c <= 0) continue;
      let sum = 0;
      for (let i = 0; i < samples; i++) {
        sum += Math.abs(privatizeCount(c, eps) - c) / c;
      }
      totalRel += sum / samples;
      n++;
    }
    return {
      epsilon: eps,
      relativeError: n > 0 ? totalRel / n : 0,
      privacyLevel: labelFor(eps),
    };
  });
}
