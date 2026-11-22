import { it, expect } from "vite-plus/test";
import { act, create, start, type Action } from "../src/game/game";
import { at } from "../src/game/spatial";
const exchange = (x: number, y: number, dx: number, dy: number): Action => ({
  type: "swap",
  from: { x, y },
  to: { x: x + dx, y: y + dy },
});
it("plays eight normal-mode turns and collects both descendants of a newly synthesized phosphorus sulfide", () => {
  let g = start(create(24), 0);
  const moves: Action[] = [
    exchange(0, 3, 0, -1),
    { type: "shift", id: at(g.board, { x: 8, y: 8 })!.id, to: { x: 6, y: 8 } },
    exchange(8, 5, 1, 0),
    exchange(4, 9, -1, 0),
    exchange(4, 2, -1, 0),
    exchange(2, 4, 0, -1),
    { type: "harvest", id: at(g.board, { x: 5, y: 0 })!.id },
    exchange(6, 3, 0, -1),
  ];
  let sulfideId: number | undefined;
  let phosphates: number[] = [];
  const collected: number[] = [];
  for (const [i, a] of moves.entries()) {
    g = act(g, a, (i + 1) * 2000);
    expect(g.turn).toBe(i + 1);
    for (const e of g.events) {
      if (i === 4 && e.rule.product === "P2S5") sulfideId = e.outputs[0].id;
      if (e.rule.product === "Li3PS4" && e.inputs.some((b) => b.id === sulfideId))
        phosphates = e.outputs.map((b) => b.id);
      if (e.rule.product === "LPSCl")
        collected.push(...e.inputs.filter((b) => phosphates.includes(b.id)).map((b) => b.id));
    }
  }
  expect(sulfideId).toBeDefined();
  expect(phosphates).toHaveLength(2);
  expect(collected.sort()).toEqual(phosphates.sort());
  expect(g.collected).toBe(5);
});
