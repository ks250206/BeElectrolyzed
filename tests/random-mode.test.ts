import { expect, it } from "vite-plus/test";
import { act, clock, create, pause, start } from "../src/game/game";
import { byProduct } from "../src/game/chemistry";
import { indexBoard } from "../src/game/spatial";

it("deals only elements with fourteen vacancies, two isotopes and reproducible positions", () => {
  const seenEmpty = new Set<number>();
  const seenOccupied = new Set<number>();
  for (let i = 0; i < 128; i++) {
    const seed = Math.imul(i, 2654435761) >>> 0;
    const g = create(seed, "random");
    expect(g.board).toHaveLength(130);
    expect(g.board.every((b) => !byProduct.has(b.k) && b.w === 1 && b.h === 1)).toBe(true);
    expect(g.board.filter((b) => b.k === "Li6")).toHaveLength(2);
    const grid = indexBoard(g.board);
    expect(grid.filter(Boolean)).toHaveLength(130);
    for (let cell = 0; cell < 144; cell++) (grid[cell] ? seenOccupied : seenEmpty).add(cell);
  }
  expect(seenEmpty.size).toBe(144);
  expect(seenOccupied.size).toBe(144);
  expect(create(24, "random")).toEqual(create(24, "random"));
  expect(create(24, "random").board).not.toEqual(create(25, "random").board);
});

it("makes a final from scratch and counts down only while playing", () => {
  let g = start(create(1, "random"), 0);
  for (const [x, y, dx] of [
    [8, 6, 1],
    [7, 7, -1],
    [8, 9, -1],
  ]) {
    g = act(g, { type: "swap", from: { x, y }, to: { x: x + dx, y } }, 1000 * (g.turn + 1));
  }
  expect(g.collected).toBe(1);
  expect(g.score).toBe(1200);
  g = pause(g, 5000);
  expect(clock(g, 15000).remaining).toBe(175000);
  expect(clock(start(g, 15000), 190000).phase).toBe("ended");
});
