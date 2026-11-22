import { expect, it } from "vite-plus/test";
import { act, create, start, type Action } from "../src/game/game";
import { at } from "../src/game/spatial";
it("collects an LGPS grown from a newly synthesized phosphorus sulfide and its two phosphate products", () => {
  let g = start(create(24), 0);
  const play = (a: Action) => {
    const n = act(g, a, (g.turn + 1) * 1800);
    expect(n.turn).toBe(g.turn + 1);
    g = n;
  };
  const id = (x: number, y: number) => at(g.board, { x, y })!.id;
  const shift = (x: number, y: number, tx: number, ty: number) =>
    play({ type: "shift", id: id(x, y), to: { x: tx, y: ty } });
  const swap = (x: number, y: number, tx: number, ty: number) =>
    play({ type: "swap", from: { x, y }, to: { x: tx, y: ty } });
  const collect = (x: number, y: number) => play({ type: "collect", id: id(x, y) });
  shift(8, 8, 6, 8);
  const sulfide = g.events.find((e) => e.rule.product === "P2S5")!.outputs[0];
  collect(5, 8);
  swap(9, 4, 9, 5);
  collect(6, 3);
  swap(4, 6, 3, 6);
  collect(2, 2);
  swap(3, 7, 2, 7);
  play({ type: "harvest", id: id(5, 0) });
  swap(3, 9, 3, 8);
  swap(7, 10, 6, 10);
  swap(1, 2, 0, 2);
  swap(11, 0, 11, 1);
  swap(10, 11, 9, 11);
  shift(7, 9, 8, 9);
  play({ type: "harvest", id: id(5, 10) });
  swap(6, 3, 6, 4);
  swap(7, 1, 7, 2);
  swap(9, 9, 8, 9);
  shift(10, 7, 11, 7);
  const phosphate = g.events.find((e) => e.rule.product === "Li3PS4")!;
  expect(phosphate.inputs).toContainEqual(sulfide);
  const final = g.events.find((e) => e.rule.product === "LGPS")!;
  expect(final.inputs).toEqual(expect.arrayContaining(phosphate.outputs));
  expect(final.points).toBe(0);
  collect(8, 8);
  expect(g.pickups).toEqual(final.outputs);
  expect(g.collected).toBe(4);
  expect(g.score).toBe(6780);
});
