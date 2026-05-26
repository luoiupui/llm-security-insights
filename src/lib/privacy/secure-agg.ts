// Illustrative pairwise-mask secure aggregation.
// NOT cryptographically secure — purely for visualizing the cancellation pattern.

export interface AggDemo {
  clients: number;
  trueValues: number[];
  masks: number[][]; // masks[i][j] = mask client i adds when paired with j (with sign)
  maskedValues: number[]; // what the server sees per client
  trueSum: number;
  serverSum: number; // should equal trueSum
}

function rngFn(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9E3779B9) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B);
    t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35);
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  };
}

export function runSecureAgg(values: number[], seed = 7): AggDemo {
  const K = values.length;
  const rand = rngFn(seed);
  // pairwise masks: m[i][j] symmetric, i adds +m, j adds -m
  const m: number[][] = Array.from({ length: K }, () => Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const v = Math.round((rand() - 0.5) * 200);
      m[i][j] = v;
      m[j][i] = -v;
    }
  }
  const masked = values.map((v, i) => v + m[i].reduce((s, x) => s + x, 0));
  return {
    clients: K,
    trueValues: values,
    masks: m,
    maskedValues: masked,
    trueSum: values.reduce((s, v) => s + v, 0),
    serverSum: masked.reduce((s, v) => s + v, 0),
  };
}
