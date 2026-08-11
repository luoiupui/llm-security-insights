/**
 * Fine-Tuning Simulation Lab — toy, in-browser adaptation engine.
 * ---------------------------------------------------------------
 * SCOPE / SAFETY:
 *   • This module NEVER touches the CTI pipeline, the prompts, the KG, or the
 *     hosted backbone (google/gemini-3-flash-preview). It cannot: the backbone
 *     is a frozen hosted model with no weight access.
 *   • What is real here: genuine gradient descent (SGD) on a tiny linear head
 *     over a deterministic hashed "frozen-encoder" feature space. That makes
 *     the loss curves authentic rather than scripted, while remaining a
 *     didactic surrogate for LoRA / QLoRA / SFT / DPO / distillation workflows.
 *   • The frozen encoder is a hash featurizer, NOT an LLM hidden state. No LLM
 *     is called anywhere in this file.
 *
 * Everything is deterministic given a seed.
 */

import { sampleTestCases, type TestSample } from "@/lib/test-corpus";
import { augmentedVariants, isAugmented } from "@/lib/augmentation";
import type { AugmentedSample } from "@/lib/augmentation/transforms";

export const DIM = 24;

/* ────────────────────────── determinism ────────────────────────── */

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ─────────────────── frozen "encoder" (hash featurizer) ─────────────────── */

const CUE_TOKENS = [
  "exploit", "cve", "vulnerab", "phish", "ransom", "c2", "command", "backdoor",
  "lateral", "persist", "credential", "malware", "campaign", "apt", "payload",
  "escalat", "exfiltrat", "loader", "zero-day", "patch",
];

/** Deterministic 24-D dense feature vector: 16 hashed n-gram buckets + 8 cue features. */
export function featurize(text: string): number[] {
  const v = new Array(DIM).fill(0);
  const toks = text.toLowerCase().match(/[a-z0-9][a-z0-9-]+/g) ?? [];
  for (const t of toks) v[hash(t) % 16] += 1;
  const lower = text.toLowerCase();
  for (let i = 0; i < CUE_TOKENS.length; i++) {
    if (lower.includes(CUE_TOKENS[i])) v[16 + (i % 8)] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/* ─────────────────────────── dataset prep ─────────────────────────── */

export type Split = "train" | "holdout";

export interface Example {
  id: string;
  seedId: string;      // cluster unit — a GoldAug variant inherits its Gold-56 seed id
  derived: boolean;
  text: string;
  x: number[];
  y: 0 | 1;            // 1 = sample carries an exploitation/causal chain
  split: Split;
}

/** Gold-derived task label: does this case encode a causal / exploitation chain? */
function labelOf(s: TestSample): 0 | 1 {
  const gt = s.groundTruth;
  const causal = (gt.causalLinks?.length ?? 0) > 0;
  const exploitish = gt.relations.some((r) =>
    /exploit|uses|delivers|targets|communicates/i.test(r.relation),
  );
  return causal || exploitish ? 1 : 0;
}

export interface DatasetOptions {
  includeAugmented: boolean;
  holdoutFraction: number; // by SEED cluster, never by row — prevents variant leakage
  seed: number;
}

export function buildDataset(opts: DatasetOptions): Example[] {
  const { includeAugmented, holdoutFraction, seed } = opts;
  const seedIds = sampleTestCases.map((s) => s.id);
  const rand = rng(seed);
  const shuffled = [...seedIds].sort(() => rand() - 0.5);
  const nHold = Math.max(1, Math.round(shuffled.length * holdoutFraction));
  const holdout = new Set(shuffled.slice(0, nHold));

  const rows: Example[] = sampleTestCases.map((s) => ({
    id: s.id,
    seedId: s.id,
    derived: false,
    text: s.text,
    x: featurize(s.text),
    y: labelOf(s),
    split: holdout.has(s.id) ? "holdout" : "train",
  }));

  if (includeAugmented) {
    const byId = new Map(sampleTestCases.map((s) => [s.id, s]));
    for (const v of augmentedVariants as AugmentedSample[]) {
      const parent = byId.get(v.seedId);
      if (!parent) continue;
      rows.push({
        id: v.id,
        seedId: v.seedId,
        derived: true,
        text: v.text,
        x: featurize(v.text),
        // derived rows inherit the seed's gold label — they add no new information
        y: labelOf(parent),
        split: holdout.has(v.seedId) ? "holdout" : "train",
      });
    }
  }
  return rows;
}

export function datasetStats(rows: Example[]) {
  const train = rows.filter((r) => r.split === "train");
  const hold = rows.filter((r) => r.split === "holdout");
  const pos = rows.filter((r) => r.y === 1).length;
  return {
    total: rows.length,
    train: train.length,
    holdout: hold.length,
    derived: rows.filter((r) => r.derived).length,
    independentLabels: new Set(rows.map((r) => r.seedId)).size,
    positiveRate: rows.length ? pos / rows.length : 0,
  };
}

/* ───────────────────────────── model core ───────────────────────────── */

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const dot = (a: number[], b: number[]) => a.reduce((s, ai, i) => s + ai * b[i], 0);

export interface Curve {
  step: number;
  trainLoss: number;
  holdoutLoss: number;
  holdoutF1: number;
}

export interface TrainResult {
  method: MethodId;
  curve: Curve[];
  trainableParams: number;
  baseParams: number;
  bytesPerParam: number;
  memoryBytes: number;
  finalF1: number;
  finalAcc: number;
  baselineF1: number;   // zero-shot / frozen-base reference
  delta: number;        // finalF1 - baselineF1
  seconds: number;
}

export type MethodId = "sft" | "lora" | "qlora" | "dpo" | "distill";

export const METHOD_LABEL: Record<MethodId, string> = {
  sft: "SFT (full head)",
  lora: "LoRA (low-rank adapter)",
  qlora: "QLoRA (quantized base + adapter)",
  dpo: "DPO (preference optimisation)",
  distill: "Knowledge distillation",
};

function f1(w: number[], b: number, rows: Example[]) {
  let tp = 0, fp = 0, fn = 0, ok = 0;
  for (const r of rows) {
    const p = sigmoid(dot(r.x, w) + b) > 0.5 ? 1 : 0;
    if (p === r.y) ok++;
    if (p === 1 && r.y === 1) tp++;
    else if (p === 1 && r.y === 0) fp++;
    else if (p === 0 && r.y === 1) fn++;
  }
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  return { f1: prec + rec ? (2 * prec * rec) / (prec + rec) : 0, acc: rows.length ? ok / rows.length : 0 };
}

function bce(w: number[], b: number, rows: Example[]) {
  if (!rows.length) return 0;
  let l = 0;
  for (const r of rows) {
    const p = sigmoid(dot(r.x, w) + b);
    l += -(r.y * Math.log(p + 1e-9) + (1 - r.y) * Math.log(1 - p + 1e-9));
  }
  return l / rows.length;
}

/** Frozen "pre-trained" base: a cheap prior over the cue features, never updated. */
function frozenBase(): { w0: number[]; b0: number } {
  const w0 = new Array(DIM).fill(0);
  for (let i = 16; i < DIM; i++) w0[i] = 0.6; // generic cue prior = the zero-shot proxy
  return { w0, b0: -0.15 };
}

/** Fake-quantise to nBits (symmetric, per-tensor) — QLoRA's frozen base treatment. */
function quantize(w: number[], nBits: number): number[] {
  const max = Math.max(...w.map(Math.abs)) || 1;
  const levels = 2 ** (nBits - 1) - 1;
  return w.map((x) => (Math.round((x / max) * levels) / levels) * max);
}

export interface TrainOptions {
  method: MethodId;
  rows: Example[];
  epochs: number;
  lr: number;
  rank: number;      // LoRA / QLoRA
  bits: number;      // QLoRA base precision
  beta: number;      // DPO strength
  temperature: number; // distillation
  seed: number;
}

export function train(opts: TrainOptions): TrainResult {
  const t0 = performance.now();
  const { method, rows, epochs, lr, rank, bits, beta, temperature, seed } = opts;
  const train = rows.filter((r) => r.split === "train");
  const hold = rows.filter((r) => r.split === "holdout");
  const rand = rng(seed);

  const { w0, b0 } = frozenBase();
  const base = method === "qlora" ? quantize(w0, bits) : w0;
  const baselineF1 = f1(base, b0, hold).f1;

  const curve: Curve[] = [];
  let w = [...base];
  let b = b0;

  // adapter parameterisation
  const lowRank = method === "lora" || method === "qlora";
  const A: number[][] = Array.from({ length: rank }, () =>
    Array.from({ length: DIM }, () => (rand() - 0.5) * 0.05),
  );
  const Bv: number[] = new Array(rank).fill(0); // zero-init, as in the LoRA paper

  const studentDim = 12; // distillation: student sees the first 12 features only
  let sw = new Array(DIM).fill(0);
  let sb = 0;
  let teacher: { w: number[]; b: number } | null = null;

  if (method === "distill") {
    // teach a full-capacity head first (the "teacher"), then compress it
    let tw = [...base], tb = b0;
    for (let e = 0; e < epochs; e++) {
      for (const r of train) {
        const err = sigmoid(dot(r.x, tw) + tb) - r.y;
        for (let i = 0; i < DIM; i++) tw[i] -= lr * err * r.x[i];
        tb -= lr * err;
      }
    }
    teacher = { w: tw, b: tb };
  }

  const effective = () => {
    if (!lowRank) return { w, b };
    const delta = new Array(DIM).fill(0);
    for (let k = 0; k < rank; k++) for (let i = 0; i < DIM; i++) delta[i] += Bv[k] * A[k][i];
    return { w: base.map((x, i) => x + delta[i]), b };
  };

  for (let e = 0; e < epochs; e++) {
    if (method === "sft") {
      for (const r of train) {
        const err = sigmoid(dot(r.x, w) + b) - r.y;
        for (let i = 0; i < DIM; i++) w[i] -= lr * err * r.x[i];
        b -= lr * err;
      }
    } else if (lowRank) {
      for (const r of train) {
        const { w: we } = effective();
        const err = sigmoid(dot(r.x, we) + b) - r.y;
        // dL/dB_k = err * (A_k · x) ; dL/dA_ki = err * B_k * x_i  (base frozen)
        for (let k = 0; k < rank; k++) {
          const ax = dot(A[k], r.x);
          const gB = err * ax;
          const bk = Bv[k];
          Bv[k] -= lr * gB;
          for (let i = 0; i < DIM; i++) A[k][i] -= lr * err * bk * r.x[i];
        }
        b -= lr * err;
      }
    } else if (method === "dpo") {
      // preference pairs: chosen = the gold-consistent row, rejected = a corrupted twin
      for (const r of train) {
        const rejected = r.x.map((xi, i) => (i >= 16 ? xi * 0.2 : xi + (rand() - 0.5) * 0.05));
        const sc = dot(r.x, w) + b;
        const sr = dot(rejected, w) + b;
        const margin = sigmoid(-beta * (sc - sr)); // dL/d(margin)
        for (let i = 0; i < DIM; i++) w[i] -= lr * beta * margin * (rejected[i] - r.x[i]) * -1;
        // keep it anchored to the label so the head stays calibrated
        const err = sigmoid(sc) - r.y;
        for (let i = 0; i < DIM; i++) w[i] -= lr * 0.5 * err * r.x[i];
        b -= lr * 0.5 * err;
      }
    } else if (method === "distill" && teacher) {
      for (const r of train) {
        const soft = sigmoid((dot(r.x, teacher.w) + teacher.b) / temperature);
        const xs = r.x.map((xi, i) => (i < studentDim ? xi : 0)); // capacity bottleneck
        const err = sigmoid(dot(xs, sw) + sb) - soft;
        for (let i = 0; i < studentDim; i++) sw[i] -= lr * err * xs[i];
        sb -= lr * err;
      }
    }

    const cur = method === "distill" ? { w: sw, b: sb } : effective();
    const holdRows = method === "distill"
      ? hold.map((r) => ({ ...r, x: r.x.map((xi, i) => (i < studentDim ? xi : 0)) }))
      : hold;
    const trainRows = method === "distill"
      ? train.map((r) => ({ ...r, x: r.x.map((xi, i) => (i < studentDim ? xi : 0)) }))
      : train;
    const m = f1(cur.w, cur.b, holdRows);
    curve.push({
      step: e + 1,
      trainLoss: bce(cur.w, cur.b, trainRows),
      holdoutLoss: bce(cur.w, cur.b, holdRows),
      holdoutF1: m.f1,
    });
  }

  const final = method === "distill" ? { w: sw, b: sb } : effective();
  const finalRows = method === "distill"
    ? hold.map((r) => ({ ...r, x: r.x.map((xi, i) => (i < studentDim ? xi : 0)) }))
    : hold;
  const fm = f1(final.w, final.b, finalRows);

  const trainableParams =
    method === "sft" ? DIM + 1
      : lowRank ? rank * DIM + rank + 1
      : method === "dpo" ? DIM + 1
      : studentDim + 1;
  const bytesPerParam = method === "qlora" ? bits / 8 : 4;

  return {
    method,
    curve,
    trainableParams,
    baseParams: DIM + 1,
    bytesPerParam,
    memoryBytes: Math.round(trainableParams * 4 + (DIM + 1) * bytesPerParam),
    finalF1: fm.f1,
    finalAcc: fm.acc,
    baselineF1,
    delta: fm.f1 - baselineF1,
    seconds: (performance.now() - t0) / 1000,
  };
}

/* ────────────────────── real-world scaling estimates ────────────────────── */

/** What the same recipe would cost on a real 7B open-weight backbone. */
export const REAL_WORLD_SCALE: Record<MethodId, {
  trainable: string; vram: string; hours: string; dataNeeded: string; verdict: string;
}> = {
  sft: {
    trainable: "≈7.0 B (100%)", vram: "≥ 8×80 GB (ZeRO-3)", hours: "20–60 GPU-h",
    dataNeeded: "5k–50k labelled pairs", verdict: "Not viable — 56 independent labels",
  },
  lora: {
    trainable: "≈4–40 M (0.06–0.6%)", vram: "1×24–48 GB", hours: "1–4 GPU-h",
    dataNeeded: "1k–10k pairs", verdict: "Viable only after gold corpus ≥ 1k",
  },
  qlora: {
    trainable: "≈4–40 M on a 4-bit base", vram: "1×16–24 GB", hours: "2–6 GPU-h",
    dataNeeded: "1k–10k pairs", verdict: "Cheapest real path; still data-bound",
  },
  dpo: {
    trainable: "adapter-sized", vram: "1×24–48 GB (+ ref model)", hours: "2–8 GPU-h",
    dataNeeded: "3k–20k preference pairs", verdict: "Blocked — no preference data collected",
  },
  distill: {
    trainable: "student 0.5–3 B", vram: "2–4×48 GB", hours: "30–200 GPU-h",
    dataNeeded: "50k–500k teacher traces", verdict: "Feasible for latency/cost, needs trace harvesting",
  },
};
