import { describe, it, expect } from "vite-plus/test";
import { byProduct, formulas, recipes, type Product } from "../src/game/chemistry";
import { create, start, act, clock, pause, destinations, type Game } from "../src/game/game";
import { at, indexBoard, match, overlaps, plan, type Block } from "../src/game/spatial";
const begin = () => start(create(24, "rare"), 0);
const swap = (g: Game, x: number, y: number, xx: number, yy: number) =>
  act(g, { type: "swap", from: { x, y }, to: { x: xx, y: yy } }, 100);
const block = (k: Product, x: number, y: number, w = 1, h = 1, id = x + 12 * y): Block => ({
  k,
  x,
  y,
  w,
  h,
  id,
});
function atoms(k: Product) {
  const f = formulas[k].replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 8320));
  return Object.fromEntries(
    [...f.matchAll(/([A-Z][a-z]?)([\d.]+)?/g)].map((m) => [m[1], Number(m[2] ?? 1)]),
  );
}
describe("chemistry", () => {
  for (const r of recipes)
    it("balances " + r.product, () => {
      const tally: Record<string, number> = {};
      for (const [k, n] of Object.entries(r.needs))
        for (const [e, q] of Object.entries(atoms(k as Product)))
          tally[e] = (tally[e] ?? 0) + n * q;
      expect(
        Object.fromEntries(Object.entries(atoms(r.product)).map(([e, q]) => [e, q * r.count])),
      ).toEqual(tally);
    });
  it("plans both phosphate blocks atomically and counts each whole reactant once", () => {
    const r = byProduct.get("Li3PS4")!,
      inputs = [
        block("P2S5", 0, 0, 2),
        block("Li2S", 0, 1, 2),
        block("Li2S", 2, 0, 2),
        block("Li2S", 2, 1, 2),
      ];
    const outputs = plan(r, inputs, inputs, inputs[0], 200)!;
    expect(outputs).toHaveLength(2);
    expect(overlaps(outputs[0], outputs[1])).toBe(false);
    expect(match(r, [inputs[0]], indexBoard(inputs.slice(0, 3)), new Set())).toBeUndefined();
    const row = inputs.map((b, i) => ({ ...b, x: i * 2, y: 0 })),
      wall = Array.from({ length: 12 }, (_, x) => block("P", x, 1));
    expect(plan(r, row, [...row, ...wall], row[0], 200)).toBeUndefined();
    const separate = inputs.map((b, i) => (i === 3 ? { ...b, y: 5 } : b));
    expect(match(r, [separate[0]], indexBoard(separate), new Set())).toBeUndefined();
  });
});
it("collects an ordinary final on the normal seeded opening", () => {
  for (let i = 0; i < 35; i++) {
    const g = swap(start(create(i), 0), 0, 3, 0, 2);
    expect(g.collected).toBeGreaterThan(0);
    expect(g.events.some((e) => e.rule.product === "LPSCl")).toBe(true);
    expect(g.events.some((e) => e.depth === 2)).toBe(true);
  }
});
it("plays the two-lock route, harvest and rectangle exchange for a two-unit batch", () => {
  let g = act(begin(), { type: "reserve", target: "MixedX" }, 0);
  g = swap(g, 0, 3, 0, 2);
  const cl = g.board.find((b) => b.k === "LPSCl")!;
  expect(cl.locked).toBe(true);
  expect(g.score).toBe(g.events.filter((e) => !e.retained).reduce((s, e) => s + e.points, 0));
  g = swap(g, 8, 3, 8, 2);
  expect(g.board.filter((b) => b.locked)).toHaveLength(2);
  g = act(g, { type: "harvest", id: at(g.board, { x: 5, y: 0 })!.id }, 100);
  expect(g.charges).toBe(2);
  const r = destinations(g, cl).find((v) => v.x === 4 && v.y === 2);
  expect(r).toBeDefined();
  const before = g.score;
  g = act(g, { type: "shift", id: cl.id, to: r! }, 100);
  expect(g.events[0].rule.product).toBe("MixedX");
  expect(g.events[0].outputs[0].units).toBe(2);
  expect(g.events[0].points).toBe(10000);
  expect(g.score - before).toBe(g.events.reduce((s, e) => s + e.points, 0));
  expect(g.batches).toBe(1);
  expect(g.made.MixedX).toBe(1);
  expect(g.made.LPSCl).toBe(1);
  expect(g.made.LPSBr).toBe(1);
});
it("preserves identity in a legal exchange and rejects cuts, overlap, distant or offboard moves for free", () => {
  const b = { ...block("LPSCl", 2, 2, 2, 3), locked: true };
  const isotope = block("Li6", 4, 2);
  let g = { ...begin(), board: [b, isotope, block("Li2S", 3, 5, 2)], charges: 3 };
  for (const to of [
    { x: 2, y: 5 },
    { x: 3, y: 2 },
    { x: 8, y: 2 },
    { x: 2, y: -1 },
  ]) {
    const n = act(g, { type: "shift", id: b.id, to }, 0, false);
    expect(n.board).toEqual(g.board);
    expect(n.charges).toBe(3);
  }
  g = act(g, { type: "shift", id: b.id, to: { x: 4, y: 2 } }, 100, false);
  expect(at(g.board, { x: 4, y: 2 })).toEqual({ ...b, x: 4 });
  expect(at(g.board, { x: 2, y: 2 })).toEqual({ ...isotope, x: 2 });
  expect(g.charges).toBe(1);
});
it("keeps isotopes at cap, accepts them as lithium without granting charge", () => {
  const isotope = block("Li6", 0, 0),
    g = { ...begin(), board: [isotope, block("Cl", 2, 0)], charges: 3 };
  expect(act(g, { type: "harvest", id: isotope.id }, 0).board).toEqual(g.board);
  const n = swap(g, 0, 0, 1, 0);
  expect(n.charges).toBe(3);
  expect(n.events[0].rule.product).toBe("LiCl");
});
it("settles locks once at release or deadline, never advances while paused or after timeout", () => {
  let g = swap(
    act(start(create(2), 1000), { type: "reserve", target: "MixedX" }, 1000),
    0,
    3,
    0,
    2,
  );
  const b = g.board.find((v) => v.locked)!;
  const released = act(g, { type: "release", id: b.id }, 2000);
  expect(released.made.LPSCl).toBe(g.made.LPSCl);
  expect(released.score).toBe(g.score + 1000 + released.events.reduce((s, e) => s + e.points, 0));
  expect(act(released, { type: "release", id: b.id }, 2100).score).toBe(released.score);
  g = pause(g, 2500);
  expect(clock(g, 99999)).toEqual(g);
  g = start(g, 100000);
  const expired = act(g, { type: "release", id: b.id }, 300000);
  expect(expired.phase).toBe("ended");
  expect(expired.score).toBe(g.score + 1000);
  expect(clock(expired, 400000)).toEqual(expired);
});
it("leaves refill inert and workspace available", () => {
  const g = swap(begin(), 0, 3, 0, 2);
  expect(g.board.reduce((s, b) => s + b.w * b.h, 0)).toBe(130);
  expect(clock(g, 9999).board).toBe(g.board);
});
function packed(blocks: Block[], holes: PointLike[] = []): Block[] {
  const grid = indexBoard(blocks),
    filler: Block[] = [];
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++)
      if (!grid[y * 12 + x] && !holes.some((p) => p.x === x && p.y === y))
        filler.push(block("Cl", x, y, 1, 1, 500 + y * 12 + x));
  return [...blocks, ...filler];
}
type PointLike = { x: number; y: number };
it("tries a fitting connected subset when the first germanate placement is blocked", () => {
  const ge = block("GeS2", 3, 4, 2),
    a = block("Li2S", 1, 3, 2),
    b = block("Li2S", 5, 3, 2),
    c = block("Li2S", 1, 2, 2);
  const g = { ...begin(), nextId: 1000, board: packed([ge, a, b, c]) };
  const n = act(g, { type: "shift", id: ge.id, to: { x: 3, y: 3 } }, 1, false);
  expect(n.events[0].rule.product).toBe("Li4GeS4");
  expect(n.events[0].inputs.map((v) => v.id).sort()).toEqual([a.id, c.id, ge.id].sort());
});
for (const type of ["harvest", "release"] as const)
  it(type + " opens a blocked footprint before refill and retries the local reaction", () => {
    const plug =
      type === "harvest" ? block("Li6", 3, 3) : { ...block("LPSBr", 3, 3, 2, 3), locked: true };
    const ingredients = [block("GeS2", 1, 2, 2), block("Li2S", 3, 2, 2), block("Li2S", 5, 2, 2)];
    const g = { ...begin(), nextId: 1000, board: packed([...ingredients, plug], [{ x: 2, y: 3 }]) };
    expect(plan(byProduct.get("Li4GeS4")!, ingredients, g.board, plug, 1000)).toBeUndefined();
    const n = act(g, { type, id: plug.id }, 1);
    expect(n.events[0].rule.product).toBe("Li4GeS4");
  });
it("harvesting never guarantees its own replacement", () => {
  let g = begin();
  expect(g.board.filter((b) => b.k === "Li6")).toHaveLength(2);
  for (const b of g.board.filter((b) => b.k === "Li6"))
    g = act(g, { type: "harvest", id: b.id }, 1);
  expect(g.charges).toBe(3);
  expect(g.board.some((b) => b.k === "Li6")).toBe(false);
});
it("protects a spatially blocked final from a lower-priority phosphate reaction", () => {
  const inputs = [
    block("Li3PS4", 0, 0, 2, 2),
    block("Li2S", 2, 0, 2),
    block("LiCl", 4, 0, 2),
    block("P2S5", 2, 1, 1, 2),
    block("Li2S", 3, 2, 2),
    block("Li2S", 3, 3, 2),
  ];
  // Release an adjacent isotope to retry this cluster.
  const isotope = block("Li6", 3, 1);
  expect(
    plan(
      byProduct.get("Li3PS4")!,
      [inputs[1], ...inputs.slice(3)],
      packed(inputs, [isotope]),
      isotope,
      1000,
    ),
  ).toHaveLength(2);
  const g = { ...begin(), nextId: 1000, board: packed([...inputs, isotope]) };
  const n = act(g, { type: "harvest", id: isotope.id }, 1, false);
  expect(n.blocked.map((b) => b.id)).toContain(inputs[1].id);
  expect(n.board.some((b) => b.id === inputs[1].id)).toBe(true);
});
it("combines the Ge/Sn endpoints as one two-unit batch", () => {
  const ge = { ...block("LGPS", 0, 0, 2, 3), locked: true },
    sn = { ...block("LSPS", 4, 0, 2, 3), locked: true };
  const n = act(
    { ...begin(), target: "MixedM", charges: 2, board: [ge, sn] },
    { type: "shift", id: ge.id, to: { x: 2, y: 0 } },
    0,
    false,
  );
  expect(n.events[0].rule.product).toBe("MixedM");
  expect(n.events[0].outputs[0].units).toBe(2);
  expect(n.score).toBe(15600);
});
it("opens the Ge or Sn route in ordinary play with one legal exchange and two distinct phosphates", () => {
  for (const seed of [24, 25]) {
    const g = start(create(seed), 0),
      b = at(g.board, { x: 8, y: 8 })!;
    const n = act(g, { type: "shift", id: b.id, to: { x: 6, y: 8 } }, 2000);
    expect(n.events.find((e) => e.rule.product === "Li3PS4")?.outputs).toHaveLength(2);
    expect(n.events.some((e) => e.rule.product === (seed % 2 === 0 ? "LGPS" : "LSPS"))).toBe(true);
  }
});
it("banks a sixth-swap isotope opportunity if the workspace is full", () => {
  const board = Array.from({ length: 132 }, (_, i) => block("Cl", i % 12, Math.floor(i / 12)));
  let g = swap({ ...begin(), swaps: 5, board, nextId: 500 }, 0, 0, 1, 0);
  expect(g.isotopeDue).toBe(true);
  expect(g.board.some((b) => b.k === "Li6")).toBe(false);
  g = swap({ ...g, board: g.board.slice(0, 130) }, 0, 0, 1, 0);
  expect(g.isotopeDue).toBe(false);
  expect(g.board.filter((b) => b.k === "Li6")).toHaveLength(1);
});
