import { canonical, type Product, type Recipe } from "./chemistry";
export const N = 12;
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  w: number;
  h: number;
}
export interface Block extends Rect {
  id: number;
  k: Product;
  units?: number;
}
export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const inside = (a: Rect) => a.x >= 0 && a.y >= 0 && a.x + a.w <= N && a.y + a.h <= N;
export const contains = (a: Rect, b: Point) =>
  b.x >= a.x && b.y >= a.y && b.x < a.x + a.w && b.y < a.y + a.h;
export const cell = (p: Point): Rect => ({ ...p, w: 1, h: 1 });
export const at = (board: Block[], p: Point) => board.find((b) => contains(b, p));
export const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const dirs = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export function indexBoard(board: Block[]) {
  const grid: (Block | undefined)[] = Array(N * N);
  for (const b of board)
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) grid[y * N + x] = b;
  return grid;
}
export function vacantCells(board: Block[]): Point[] {
  const grid = indexBoard(board),
    empty: Point[] = [];
  for (let i = 0; i < N * N; i++) if (!grid[i]) empty.push({ x: i % N, y: Math.floor(i / N) });
  return empty;
}
export function contacts(b: Rect, grid: ReturnType<typeof indexBoard>) {
  const found = new Set<Block>();
  function add(x: number, y: number) {
    if (x >= 0 && x < N && y >= 0 && y < N) {
      const n = grid[y * N + x];
      if (n) found.add(n);
    }
  }
  for (let x = b.x; x < b.x + b.w; x++) {
    add(x, b.y - 1);
    add(x, b.y + b.h);
  }
  for (let y = b.y; y < b.y + b.h; y++) {
    add(b.x - 1, y);
    add(b.x + b.w, y);
  }
  return [...found];
}
// Each expansion crosses a shared edge. A recipe has at most seven reactants.
export function match(
  rule: Recipe,
  seeds: Block[],
  grid: ReturnType<typeof indexBoard>,
  reserved: Set<number>,
  accept: (group: Block[]) => boolean = () => true,
) {
  const needed = (b: Block) => rule.needs[canonical(b.k)] ?? 0;
  const eligible = (b: Block) => needed(b) > 0 && !reserved.has(b.id);
  const size = Object.values(rule.needs).reduce((a, b) => a + b, 0);
  const visited = new Set<string>(),
    edges = new Map<number, Block[]>();
  function neighbors(b: Block) {
    let result = edges.get(b.id);
    if (!result) {
      result = contacts(b, grid).filter(eligible);
      edges.set(b.id, result);
    }
    return result;
  }
  function grow(group: Block[]): Block[] | undefined {
    const key = group
      .map((b) => b.id)
      .sort((a, b) => a - b)
      .join(",");
    if (visited.has(key)) return;
    visited.add(key);
    if (group.length === size) return accept(group) ? group : undefined;
    for (const next of new Set(group.flatMap(neighbors))) {
      if (
        group.includes(next) ||
        group.filter((b) => canonical(b.k) === canonical(next.k)).length >= needed(next)
      )
        continue;
      const result = grow([...group, next]);
      if (result) return result;
    }
  }
  for (const seed of seeds.filter(eligible)) {
    // Discard locally impossible searches before enumerating connected subsets.
    const reachable = new Set([seed]);
    let frontier = [seed];
    for (let i = 1; i < size && frontier.length; i++) {
      frontier = [...new Set(frontier.flatMap(neighbors))].filter((b) => !reachable.has(b));
      frontier.forEach((b) => reachable.add(b));
    }
    if (
      Object.entries(rule.needs).some(
        ([k, n]) => [...reachable].filter((b) => canonical(b.k) === k).length < n,
      )
    )
      continue;
    const result = grow([seed]);
    if (result) return result;
  }
}
export function plan(
  rule: Recipe,
  inputs: Block[],
  board: Block[],
  anchor: Point,
  nextId: number,
): Block[] | undefined {
  const cells = inputs.flatMap((b) =>
    Array.from({ length: b.w * b.h }, (_, i) => ({
      x: b.x + (i % b.w),
      y: b.y + Math.floor(i / b.w),
    })),
  );
  const occupied = indexBoard(board.filter((b) => !inputs.includes(b)));
  const shapes =
    rule.tier === 1
      ? [
          [2, 1],
          [1, 2],
        ]
      : rule.tier === 2
        ? [[2, 2]]
        : rule.tier === 3
          ? [
              [2, 3],
              [3, 2],
            ]
          : [
              [3, 3],
              [4, 2],
              [2, 4],
            ];
  const seen = new Set<string>(),
    choices: { b: Block; cover: number }[] = [];
  for (const [w, h] of shapes)
    for (const p of cells)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          const b = {
            x: p.x - dx,
            y: p.y - dy,
            w,
            h,
            id: nextId,
            k: rule.product,
            units: rule.tier === 4 ? 2 : 1,
          };
          const key = [b.x, b.y, w, h].join("/");
          if (!inside(b) || seen.has(key)) continue;
          seen.add(key);
          let clear = true;
          for (let y = b.y; y < b.y + h && clear; y++)
            for (let x = b.x; x < b.x + w; x++)
              if (occupied[y * N + x]) {
                clear = false;
                break;
              }
          if (clear) choices.push({ b, cover: cells.filter((c) => contains(b, c)).length });
        }
  choices.sort(
    (a, b) =>
      b.cover - a.cover || dist(a.b, anchor) - dist(b.b, anchor) || a.b.y - b.b.y || a.b.x - b.b.x,
  );
  for (const { b } of choices) {
    if (rule.count === 1 || rule.tier === 4) return [b];
    const other = choices.find((c) => !overlaps(b, c.b));
    if (other) return [b, { ...other.b, id: nextId + 1 }];
  }
}
