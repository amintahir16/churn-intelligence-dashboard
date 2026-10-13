/**
 * Minimal LightGBM inference + exact TreeSHAP (Lundberg et al., 2018, Algorithm 2)
 * over trees exported by analysis/churn_pipeline.py.
 */

export interface FlatTree {
  f: number[]; // split feature (-1 = leaf)
  t: number[]; // threshold
  l: number[];
  r: number[];
  d: number[]; // default_left
  m: number[]; // missing type: 0 None, 1 Zero, 2 NaN
  v: number[]; // leaf value / internal value
  c: number[]; // cover (sample count)
}

export type Row = (number | null)[];

const ZERO = 1e-35;

function goLeft(tree: FlatTree, node: number, raw: number | null): boolean {
  let x = raw === null || Number.isNaN(raw) ? NaN : raw;
  const mt = tree.m[node];
  if (Number.isNaN(x) && mt !== 2) x = 0;
  if ((mt === 1 && Math.abs(x) <= ZERO) || (mt === 2 && Number.isNaN(x))) return tree.d[node] === 1;
  return x <= tree.t[node];
}

function leafOf(tree: FlatTree, x: Row): number {
  let n = 0;
  while (tree.f[n] !== -1) n = goLeft(tree, n, x[tree.f[n]]) ? tree.l[n] : tree.r[n];
  return n;
}

export function rawScore(trees: FlatTree[], x: Row): number {
  let s = 0;
  for (const t of trees) s += t.v[leafOf(t, x)];
  return s;
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function predict(trees: FlatTree[], x: Row): number {
  return sigmoid(rawScore(trees, x));
}

export function expectedValue(trees: FlatTree[]): number {
  let ev = 0;
  for (const t of trees) {
    const total = t.c[0];
    for (let i = 0; i < t.f.length; i++) if (t.f[i] === -1) ev += (t.v[i] * t.c[i]) / total;
  }
  return ev;
}

interface PathEl {
  fi: number;
  z: number;
  o: number;
  w: number;
}

function extend(path: PathEl[], depth: number, z: number, o: number, fi: number) {
  path[depth] = { fi, z, o, w: depth === 0 ? 1 : 0 };
  for (let i = depth - 1; i >= 0; i--) {
    path[i + 1].w += (o * path[i].w * (i + 1)) / (depth + 1);
    path[i].w = (z * path[i].w * (depth - i)) / (depth + 1);
  }
}

function unwind(path: PathEl[], depth: number, idx: number) {
  const o = path[idx].o;
  const z = path[idx].z;
  let next = path[depth].w;
  for (let i = depth - 1; i >= 0; i--) {
    if (o !== 0) {
      const tmp = path[i].w;
      path[i].w = (next * (depth + 1)) / ((i + 1) * o);
      next = tmp - (path[i].w * z * (depth - i)) / (depth + 1);
    } else {
      path[i].w = (path[i].w * (depth + 1)) / (z * (depth - i));
    }
  }
  for (let i = idx; i < depth; i++) {
    path[i] = { ...path[i], fi: path[i + 1].fi, z: path[i + 1].z, o: path[i + 1].o };
  }
}

function unwoundSum(path: PathEl[], depth: number, idx: number): number {
  const o = path[idx].o;
  const z = path[idx].z;
  let next = path[depth].w;
  let total = 0;
  for (let i = depth - 1; i >= 0; i--) {
    if (o !== 0) {
      const tmp = (next * (depth + 1)) / ((i + 1) * o);
      total += tmp;
      next = path[i].w - tmp * z * ((depth - i) / (depth + 1));
    } else if (z !== 0) {
      total += path[i].w / z / ((depth - i) / (depth + 1));
    }
  }
  return total;
}

function recurse(
  tree: FlatTree, x: Row, phi: Float64Array, node: number,
  parent: PathEl[], depth: number, pz: number, po: number, pfi: number,
) {
  const path = parent.slice(0, depth).map((e) => ({ ...e }));
  extend(path, depth, pz, po, pfi);

  if (tree.f[node] === -1) {
    for (let i = 1; i <= depth; i++) {
      const w = unwoundSum(path, depth, i);
      const el = path[i];
      phi[el.fi] += w * (el.o - el.z) * tree.v[node];
    }
    return;
  }

  const left = goLeft(tree, node, x[tree.f[node]]);
  const hot = left ? tree.l[node] : tree.r[node];
  const cold = left ? tree.r[node] : tree.l[node];
  const cover = tree.c[node];
  const hz = tree.c[hot] / cover;
  const cz = tree.c[cold] / cover;
  let iz = 1;
  let io = 1;
  let d = depth;
  const sf = tree.f[node];
  for (let k = 1; k <= d; k++) {
    if (path[k].fi === sf) {
      iz = path[k].z;
      io = path[k].o;
      unwind(path, d, k);
      d -= 1;
      break;
    }
  }
  recurse(tree, x, phi, hot, path, d + 1, hz * iz, io, sf);
  recurse(tree, x, phi, cold, path, d + 1, cz * iz, 0, sf);
}

/** Exact SHAP values in log-odds space. Returns [phi_0..phi_{F-1}, bias]. */
export function treeShap(trees: FlatTree[], x: Row, nFeatures: number): Float64Array {
  const phi = new Float64Array(nFeatures + 1);
  for (const t of trees) {
    if (t.f[0] !== -1) recurse(t, x, phi, 0, [], 0, 1, 1, -1);
  }
  phi[nFeatures] += expectedValue(trees);
  return phi;
}
