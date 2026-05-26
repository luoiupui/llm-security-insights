// Toy in-browser FedAvg simulator. Trains a logistic-regression head over
// synthetic 8-D embeddings for K clients ("hospitals"), reports per-round
// loss, inter-client weight divergence, and centralized-baseline gap.
// Deterministic given seed.

export interface FLRoundMetrics {
  round: number;
  avgLoss: number;
  divergence: number; // ||client_w - global_w||_2 averaged
  acc: number; // simple holdout
}

export interface FLRunResult {
  rounds: FLRoundMetrics[];
  centralizedFinalAcc: number;
  federatedFinalAcc: number;
  gap: number;
}

// Mulberry32 PRNG for determinism
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIM = 8;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

interface Sample { x: number[]; y: number }

function synthData(n: number, rand: () => number, drift = 0): Sample[] {
  // Two gaussian clusters in 8D; drift shifts one cluster slightly per client
  const out: Sample[] = [];
  for (let i = 0; i < n; i++) {
    const y = rand() < 0.5 ? 0 : 1;
    const x = Array.from({ length: DIM }, (_, k) => {
      const center = y === 1 ? 1 + drift * (k % 2 === 0 ? 1 : -1) : -1;
      return center + (rand() - 0.5) * 1.6;
    });
    out.push({ x, y });
  }
  return out;
}

function trainStep(w: number[], b: number, data: Sample[], lr: number, epochs: number) {
  for (let e = 0; e < epochs; e++) {
    for (const { x, y } of data) {
      const z = x.reduce((s, xi, i) => s + xi * w[i], b);
      const p = sigmoid(z);
      const err = p - y;
      for (let i = 0; i < DIM; i++) w[i] -= lr * err * x[i];
      b -= lr * err;
    }
  }
  return { w, b };
}

function accuracy(w: number[], b: number, data: Sample[]) {
  let ok = 0;
  for (const { x, y } of data) {
    const p = sigmoid(x.reduce((s, xi, i) => s + xi * w[i], b));
    if ((p > 0.5 ? 1 : 0) === y) ok++;
  }
  return ok / data.length;
}

function loss(w: number[], b: number, data: Sample[]) {
  let l = 0;
  for (const { x, y } of data) {
    const p = sigmoid(x.reduce((s, xi, i) => s + xi * w[i], b));
    l += -(y * Math.log(p + 1e-9) + (1 - y) * Math.log(1 - p + 1e-9));
  }
  return l / data.length;
}

export function runFedAvg(opts: {
  clients?: number;
  rounds?: number;
  samplesPerClient?: number;
  localEpochs?: number;
  lr?: number;
  seed?: number;
} = {}): FLRunResult {
  const K = opts.clients ?? 5;
  const R = opts.rounds ?? 10;
  const N = opts.samplesPerClient ?? 80;
  const E = opts.localEpochs ?? 2;
  const lr = opts.lr ?? 0.1;
  const rand = rng(opts.seed ?? 42);

  const clientData = Array.from({ length: K }, (_, k) =>
    synthData(N, rand, (k - (K - 1) / 2) * 0.15),
  );
  const holdout = synthData(200, rand, 0);

  let globalW = Array(DIM).fill(0);
  let globalB = 0;
  const rounds: FLRoundMetrics[] = [];

  for (let r = 0; r < R; r++) {
    const trained = clientData.map((d) => {
      const w = [...globalW];
      const { w: w2, b: b2 } = trainStep(w, globalB, d, lr, E);
      return { w: w2, b: b2 };
    });
    // FedAvg
    const newW = Array(DIM).fill(0);
    let newB = 0;
    for (const c of trained) {
      for (let i = 0; i < DIM; i++) newW[i] += c.w[i] / K;
      newB += c.b / K;
    }
    // divergence
    let div = 0;
    for (const c of trained) {
      let s = 0;
      for (let i = 0; i < DIM; i++) s += (c.w[i] - newW[i]) ** 2;
      div += Math.sqrt(s);
    }
    div /= K;
    globalW = newW;
    globalB = newB;
    rounds.push({
      round: r + 1,
      avgLoss: loss(globalW, globalB, holdout),
      divergence: div,
      acc: accuracy(globalW, globalB, holdout),
    });
  }

  // Centralized baseline
  const allData = clientData.flat();
  const cw = Array(DIM).fill(0);
  const { w: cwOut, b: cbOut } = trainStep(cw, 0, allData, lr, R * E);
  const centralizedAcc = accuracy(cwOut, cbOut, holdout);
  const fedAcc = rounds[rounds.length - 1].acc;
  return {
    rounds,
    centralizedFinalAcc: centralizedAcc,
    federatedFinalAcc: fedAcc,
    gap: centralizedAcc - fedAcc,
  };
}
