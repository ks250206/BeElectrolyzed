import { expect, it } from "vite-plus/test";
import { act, clock, create, start, waterArea, type Action } from "../src/game/game";
import { vacantCells, at, type Block } from "../src/game/spatial";

it("earns one drop from six binaries and records all actual products during a chain", () => {
  let g = start(create(1, "random"), 0);
  expect(g.water).toBe(0);
  expect(g.made).toEqual({});
  let binary = 0;
  for (const [x, y, dx] of [
    [8, 6, 1],
    [7, 7, -1],
    [8, 9, -1],
  ]) {
    const a: Action = { type: "swap", from: { x, y }, to: { x: x + dx, y } };
    const previous = structuredClone(g.made);
    act(g, a, 0, false);
    expect(g.made).toEqual(previous);
    g = act(g, a, 100);
    binary += g.events
      .filter((e) => e.rule.tier === 1)
      .reduce((sum, e) => sum + e.outputs.length, 0);
    expect(g.water).toBe(Math.min(6, binary));
  }
  expect(g.water).toBe(6);
  expect(g.made.Li3PS4).toBe(2);
  expect(g.made.LPSBr).toBe(1);
  expect(Object.values(g.made).reduce((a, b) => a + b, 0)).toBe(9);
  expect(clock(g, 180001).made).toEqual(g.made);
});

it("dissolves only fully enclosed non-final crystals and recrystallizes their footprint once", () => {
  const board: Block[] = [
    { id: 1, k: "Li2S", x: 0, y: 0, w: 2, h: 1 },
    { id: 2, k: "Li6", x: 0, y: 1, w: 1, h: 1 },
    { id: 3, k: "Li3PS4", x: 2, y: 1, w: 2, h: 2 },
    { id: 4, k: "LPSCl", x: 4, y: 0, w: 2, h: 3 },
  ];
  const g = { ...start(create(1), 0), board, water: 6 };
  const center = { x: 0, y: 0 };
  expect(waterArea(board, center).region).toEqual({ x: 0, y: 0, w: 3, h: 3 });
  const a: Action = { type: "dissolve", center };
  const n = act(g, a, 100);
  expect(n.board.slice(0, 2)).toEqual(board.slice(2));
  expect(vacantCells(n.board)).toEqual(vacantCells(board));
  expect(n.board.slice(2).map((b) => b.id)).toEqual([g.nextId, g.nextId + 1, g.nextId + 2]);
  expect(n.water).toBe(0);
  expect(n.charges).toBe(g.charges);
  expect(n.made).toEqual(g.made);
  expect(n.score).toBe(0);
  expect(n.events).toEqual([]);
  expect(act(g, a, 100)).toEqual(n);
  expect(act(n, a, 100).board).toBe(n.board);
  for (const p of [
    { x: 5, y: 1 },
    { x: 11, y: 11 },
    { x: -1, y: 1 },
  ]) {
    const rejected = act(g, { type: "dissolve", center: p }, 100);
    expect(rejected.water).toBe(6);
    expect(rejected.turn).toBe(0);
    expect(rejected.seed).toBe(g.seed);
  }
});

it("starts with one solution bottle and fills exactly the vacant cells without starting reactions", () => {
  for (const mode of ["attack", "random"] as const) {
    const g = start(create(24, mode), 0);
    const empty = vacantCells(g.board);
    const n = act(g, { type: "crystallize" }, 100);
    expect(empty.length).toBe(14);
    expect(n.solution).toBe(0);
    expect(vacantCells(n.board)).toEqual([]);
    expect(n.board.slice(0, g.board.length)).toEqual(g.board);
    for (const p of empty) {
      const b = at(n.board, p)!;
      expect(b.id).toBeGreaterThanOrEqual(g.nextId);
      expect(b.w * b.h).toBe(1);
    }
    expect(n.water).toBe(0);
    expect(n.made).toEqual({});
    expect(n.events).toEqual([]);
    expect(act({ ...n, solution: 1 }, { type: "crystallize" }, 200).solution).toBe(1);
    expect(act({ ...n, board: g.board }, { type: "crystallize" }, 300).board).toBe(g.board);
    expect(act(g, { type: "crystallize" }, 180000).solution).toBe(1);
    expect(create(24, mode).solution).toBe(1);
  }
});
