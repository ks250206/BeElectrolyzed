import {
  byProduct,
  endpoints,
  formulas,
  recipes,
  shape,
  type Product,
  type Recipe,
  type Target,
} from "./chemistry";
import {
  N,
  at,
  cell,
  contacts,
  contains,
  dirs,
  dist,
  indexBoard,
  inside,
  match,
  overlaps,
  plan,
  type Block,
  type Point,
} from "./spatial";
export type Mode = "attack" | "collect" | "rare";
export type Phase = "ready" | "playing" | "paused" | "ended";
export interface Reaction {
  rule: Recipe;
  inputs: Block[];
  outputs: Block[];
  points: number;
  depth: number;
  retained: boolean;
}
export interface Game {
  board: Block[];
  seed: number;
  nextId: number;
  phase: Phase;
  mode: Mode;
  remaining: number;
  since: number;
  target: Target;
  charges: number;
  score: number;
  collected: number;
  batches: number;
  turn: number;
  swaps: number;
  isotopeDue: boolean;
  events: Reaction[];
  message: string;
  blocked: Block[];
  lastChain: number;
}
export type Action =
  | { type: "swap"; from: Point; to: Point }
  | { type: "shift"; id: number; to: Point }
  | { type: "harvest" | "release"; id: number }
  | { type: "reserve"; target: Target };
const INITIAL_TIME = 180000;
function random(g: Game) {
  g.seed = (Math.imul(g.seed, 1664525) + 1013904223) >>> 0;
  return g.seed / 4294967296;
}
function put(g: Game, k: Product, x: number, y: number, w = 1, h = 1) {
  g.board.push({ k, x, y, w, h, id: g.nextId++ });
}
function supply(g: Game, exclude: Point[] = [], isotopeAllowance = 0) {
  const grid = indexBoard(g.board),
    empty: Point[] = [];
  for (let i = 0; i < N * N; i++) {
    const p = { x: i % N, y: Math.floor(i / N) };
    if (!grid[i] && !exclude.some((e) => dist(p, e) === 0)) empty.push(p);
  }
  const occupied = grid.filter(Boolean).length;
  const bag: Product[] =
    g.target === "MixedM" ? ["Ge", "Sn", "P", "P"] : ["Br", "Cl", "Ge", "Sn", "P", "P"];
  bag.push("Li", "Li", "Li", "Li", "Li", "Li", "S", "S", "S", "S", "S", "S", "S", "P");
  let isotopes = g.board.filter((b) => b.k === "Li6").length;
  const targetOccupancy =
    isotopeAllowance > 0 && isotopes < 2 ? Math.min(132, Math.max(130, occupied + 1)) : 130;
  for (let i = occupied; i < targetOccupancy && empty.length; i++) {
    const j = Math.floor(random(g) * empty.length),
      p = empty[j];
    empty[j] = empty[empty.length - 1];
    empty.pop();
    const k =
      isotopes < 2 && isotopeAllowance > 0 ? "Li6" : bag[Math.floor(random(g) * bag.length)];
    put(g, k, p.x, p.y);
    if (k === "Li6") {
      isotopes++;
      isotopeAllowance--;
      g.isotopeDue = false;
    }
  }
}
export function create(seed: number, mode: Mode = "attack"): Game {
  const g: Game = {
    board: [],
    seed: mode === "attack" ? seed : 24,
    nextId: 1,
    phase: "ready",
    mode,
    remaining: INITIAL_TIME,
    since: 0,
    target: "off",
    charges: 1,
    score: 0,
    collected: 0,
    batches: 0,
    turn: 0,
    swaps: 0,
    isotopeDue: false,
    events: [],
    message: "",
    blocked: [],
    lastChain: 0,
  };
  // Two starter workbenches. All subsequent production uses the same spatial recipes.
  for (const x of [2, 6]) {
    put(g, "Li3PS4", x, 2, 2, 2);
    put(g, "Li2S", x, 4, 2, 1);
  }
  put(g, "Cl", 1, 2);
  put(g, "Br", 9, 2);
  put(g, "Li", 0, 3);
  put(g, "Li", 8, 3);
  put(g, "Li6", 5, 0);
  put(g, "P2S5", 4, 8, 2, 1);
  put(g, "GeS2", mode === "attack" ? 10 : 9, 7, 1, 2);
  put(g, "Li2S", mode === "attack" ? 6 : 7, 9, 2, 1);
  put(g, "SnS2", 1, 9, 2, 1);
  if (mode === "attack") {
    put(g, seed % 2 === 0 ? "Li4GeS4" : "Li4SnS4", 2, 7, 2, 2);
    put(g, "Li2S", 4, 9, 2, 1);
    put(g, "Li2S", 8, 8, 2, 1);
  }
  // Clean edges keep the introductory exchange unambiguous, even after refill.
  const holes = [
    { x: 0, y: 2 },
    { x: 8, y: 2 },
    { x: 0, y: 1 },
    { x: 1, y: 3 },
    { x: 8, y: 1 },
    { x: 0, y: 4 },
  ];
  supply(g, holes, 2);
  return g;
}
export function start(g: Game, now: number): Game {
  return g.phase === "ready" || g.phase === "paused" ? { ...g, phase: "playing", since: now } : g;
}
export function clock(g: Game, now: number): Game {
  if (g.phase !== "playing" || g.mode !== "attack") return g;
  const remaining = Math.max(0, g.remaining - Math.max(0, now - g.since));
  if (remaining) return { ...g, remaining, since: Math.max(now, g.since) };
  const locks = g.board.filter((b) => b.locked);
  return {
    ...g,
    phase: "ended",
    remaining: 0,
    score: g.score + locks.reduce((s, b) => s + byProduct.get(b.k)!.points, 0),
    collected: g.collected + locks.length,
    board: g.board.filter((b) => !b.locked),
    message: "タイムアップ！ 予約結晶を精算しました。",
  };
}
export function pause(g: Game, now: number): Game {
  const t = clock(g, now);
  return t.phase === "playing" ? { ...t, phase: "paused" } : t;
}
export function destinations(g: Game, b: Block) {
  if (b.w * b.h === 1 || g.charges < (b.locked ? 2 : 1)) return [];
  return dirs
    .map(([dx, dy]) => ({ ...b, x: b.x + dx * b.w, y: b.y + dy * b.h }))
    .filter(
      (r) =>
        inside(r) &&
        g.board.every(
          (v) =>
            !overlaps(v, r) ||
            (contains(r, v) && contains(r, { x: v.x + v.w - 1, y: v.y + v.h - 1 })),
        ),
    );
}
function resolve(g: Game, changed: Block[], anchor: Point) {
  let frontier = changed,
    depth = 1;
  const reserved = new Set<number>();
  while (frontier.length) {
    const newProducts: Block[] = [];
    for (const rule of recipes) {
      for (;;) {
        const grid = indexBoard(g.board),
          available = new Set(g.board);
        const stalled = new Set<Block>();
        let outputs: Block[] | undefined;
        const inputs = match(
          rule,
          frontier.filter((b) => available.has(b)),
          grid,
          reserved,
          (group) => {
            outputs = plan(rule, group, g.board, anchor, g.nextId);
            if (!outputs) group.forEach((b) => stalled.add(b));
            return !!outputs;
          },
        );
        if (!inputs || !outputs) {
          if (stalled.size) {
            stalled.forEach((b) => reserved.add(b.id));
            g.blocked.push(...stalled);
            g.message =
              formulas[rule.product] +
              " の置き場に " +
              shape(rule.tier) +
              (rule.tier === 2 && rule.count === 2 ? " の空きが2区画" : " の空きが") +
              "必要";
          }
          break;
        }
        const retained =
          rule.tier === 3 &&
          g.target !== "off" &&
          endpoints[g.target].includes(rule.product) &&
          !g.board.some((b) => b.locked && b.k === rule.product);
        const points = retained
          ? 0
          : rule.points +
            (rule.tier === 4 ? inputs.reduce((s, b) => s + byProduct.get(b.k)!.points, 0) : 0);
        g.score += points;
        g.nextId += outputs.length;
        g.board = g.board.filter((b) => !inputs.includes(b));
        if (rule.tier < 3 || retained) {
          outputs.forEach((b) => (b.locked = retained));
          g.board.push(...outputs);
          newProducts.push(...outputs);
        }
        if (rule.tier === 3 && !retained) g.collected++;
        if (rule.tier === 4) {
          g.batches++;
          g.collected += inputs.length;
        }
        g.events.push({ rule, inputs, outputs, depth, points, retained });
      }
    }
    frontier = newProducts;
    depth++;
  }
  g.lastChain = Math.max(g.lastChain, ...g.events.map((e) => e.depth));
}
export function act(previous: Game, a: Action, now: number, refill = true): Game {
  const t = clock(previous, now);
  if (t.phase !== "playing") return t;
  const g = {
    ...t,
    board: [...t.board],
    events: [] as Reaction[],
    blocked: [] as Block[],
    message: "",
  };
  const invalid = (message: string) => ({ ...t, message });
  let changed: Block[] = [];
  let anchor: Point = { x: 0, y: 0 };
  if (a.type === "reserve") {
    if (g.board.some((b) => b.locked)) return invalid("予約を変更するには保持中の結晶を回収");
    return {
      ...g,
      target: a.target,
      message: a.target === "off" ? "自動回収に設定" : "合成前の予約を設定しました",
    };
  }
  if (a.type === "swap") {
    const one = at(g.board, a.from),
      two = at(g.board, a.to);
    if (
      !inside(cell(a.from)) ||
      !inside(cell(a.to)) ||
      dist(a.from, a.to) !== 1 ||
      (!one && !two) ||
      [one, two].some((b) => b && b.w * b.h > 1)
    )
      return invalid("元素または空きマスを上下左右に1マス交換");
    g.swaps++;
    if (g.swaps % 6 === 0) g.isotopeDue = true;
    g.board = g.board.map((b) => {
      if (b !== one && b !== two) return b;
      const p = b === one ? a.to : a.from;
      const moved = { ...b, x: p.x, y: p.y };
      changed.push(moved);
      return moved;
    });
    anchor = a.to;
    // Vacating a previously occupied cell can unblock a neighboring output.
    if (!one || !two) changed.push(...contacts(cell(!two ? a.from : a.to), indexBoard(g.board)));
  } else {
    const b = g.board.find((b) => b.id === a.id);
    if (!b) return invalid("結晶を選択してください");
    anchor = b;
    if (a.type === "shift") {
      const r = destinations(g, b).find((v) => v.x === a.to.x && v.y === a.to.y);
      if (!r) return invalid("この長方形は交換できません");
      const dx = r.x - b.x,
        dy = r.y - b.y;
      g.board = g.board.map((v) => {
        const sign = v === b ? 1 : overlaps(v, r) ? -1 : 0;
        if (!sign) return v;
        const moved = { ...v, x: v.x + sign * dx, y: v.y + sign * dy };
        changed.push(moved);
        return moved;
      });
      g.charges -= b.locked ? 2 : 1;
      anchor = r;
    } else {
      if (a.type === "harvest" && (b.k !== "Li6" || g.charges >= 3))
        return invalid("⁶Li の採取はチャージ2以下で可能");
      if (a.type === "release" && !b.locked) return invalid("保持中の結晶を選択");
      g.board = g.board.filter((v) => v !== b);
      changed = contacts(b, indexBoard(g.board));
      if (a.type === "harvest") {
        g.charges++;
        g.message = "⁶Li を採取 · チャージ +1";
      } else {
        g.score += byProduct.get(b.k)!.points;
        g.collected++;
        g.message = formulas[b.k] + " を回収";
      }
    }
  }
  g.turn++;
  resolve(g, changed, anchor);
  if (refill)
    supply(
      g,
      g.mode === "attack"
        ? []
        : [
            { x: 8, y: 2 },
            { x: 8, y: 1 },
            { x: 0, y: 2 },
          ],
      a.type !== "harvest" && g.isotopeDue ? 1 : 0,
    );
  if (!g.message && !g.events.length) g.message = "交換しました";
  return g;
}
