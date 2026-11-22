import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { CanvasRenderer, Container, Sprite, Texture } from "pixi.js";
import { LockKeyhole } from "lucide-react";
import { formulas, type Product } from "../game/chemistry";
import { at, N, dist, type Point, type Rect, type Block } from "../game/spatial";
import type { Game, Reaction } from "../game/game";
import { cavern, tile, gem, crown, heroArt } from "./art";
export function Art({ kind }: { kind: "hero" | "crown" | Product }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    if (kind === "hero") heroArt(c);
    else if (kind === "crown") {
      c.width = 240;
      c.height = 190;
      crown(c.getContext("2d")!);
    } else {
      c.width = c.height = 96;
      gem(c.getContext("2d")!, kind, 0, 0, 96, 96, true);
    }
  }, [kind]);
  return <canvas aria-hidden="true" className={"art art-" + kind} ref={ref} />;
}
const textures = new Map<string, Texture>();
function texture(b: Block) {
  const key = [b.k, b.w, b.h].join("/");
  if (!textures.has(key)) textures.set(key, Texture.from(tile(b.k, b.w, b.h)));
  return textures.get(key)!;
}
function PixiField({ board }: { board: Block[] }) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(board),
    draw = useRef<() => void>(null);
  const [failed, setFailed] = useState(false);
  latest.current = board;
  useEffect(() => {
    draw.current?.();
  }, [board]);
  useEffect(() => {
    const renderer = new CanvasRenderer(),
      scene = new Container();
    let closed = false,
      ready = false;
    const paint = () => {
      const blocks = latest.current;
      blocks.forEach((b, i) => {
        const s = (scene.children[i] as Sprite) ?? scene.addChild(new Sprite());
        s.texture = texture(b);
        s.position.set(b.x * 48, b.y * 48);
        s.width = b.w * 48;
        s.height = b.h * 48;
        s.visible = true;
      });
      for (let i = blocks.length; i < scene.children.length; i++) scene.children[i].visible = false;
      renderer.render(scene);
    };
    const destroy = () => {
      scene.destroy({ children: true });
      renderer.destroy(true);
    };
    renderer
      .init({ width: 576, height: 576, resolution: 1.5, backgroundAlpha: 0, antialias: true })
      .then(() => {
        ready = true;
        if (closed) return destroy();
        host.current!.appendChild(renderer.canvas);
        draw.current = paint;
        paint();
      })
      .catch(() => {
        if (!closed) setFailed(true);
      });
    return () => {
      closed = true;
      draw.current = null;
      if (ready) destroy();
    };
  }, []);
  return (
    <div className="pixi" ref={host}>
      {failed && "描画を開始できません。再読み込みしてください。"}
    </div>
  );
}
const pos = (b: Rect): CSSProperties => ({
  left: (b.x / N) * 100 + "%",
  top: (b.y / N) * 100 + "%",
  width: (b.w / N) * 100 + "%",
  height: (b.h / N) * 100 + "%",
});
const unit = (p: Point) => ({ ...p, w: 1, h: 1 });
export const coord = (p: Point) => String.fromCharCode(65 + p.x) + (p.y + 1);
interface Props {
  g: Game;
  selected: Rect | null;
  targets: Rect[];
  ghost: Rect[];
  cue: Rect[];
  pick: (p: Point) => void;
  drag: (a: Point, b: Point) => void;
  cancel: () => void;
  low: boolean;
  burst: Reaction | null;
}
function GrownCrystal({ b }: { b: Block }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!,
      img = tile(b.k, b.w, b.h);
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.drawImage(img, 0, 0);
  }, [b]);
  return <canvas className="grown" ref={ref} />;
}
export function Board({ g, selected, targets, ghost, cue, pick, drag, cancel, low, burst }: Props) {
  const ref = useRef<HTMLDivElement>(null),
    bg = useRef<HTMLCanvasElement>(null),
    down = useRef<{ p: Point; x: number; y: number; id: number } | null>(null),
    [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  useEffect(() => {
    cavern(bg.current!);
  }, []);
  const point = (x: number, y: number) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.floor(((x - r.left) / r.width) * N),
      y: Math.floor(((y - r.top) / r.height) * N),
    };
  };
  function keys(e: KeyboardEvent) {
    const v = (
      { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as Record<
        string,
        number[]
      >
    )[e.key];
    if (v) {
      e.preventDefault();
      setCursor({
        x: Math.max(0, Math.min(11, cursor.x + v[0])),
        y: Math.max(0, Math.min(11, cursor.y + v[1])),
      });
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }
  const highlight = (rects: Rect[], kind: string) =>
    rects.map((r, i) => <i key={kind + i} className={"mark " + kind} style={pos(r)} />);
  const effect = burst?.outputs[0],
    atCursor = at(g.board, cursor);
  return (
    <div className="coordinates">
      <div className="letters">
        {"ABCDEFGHIJKL".split("").map((c) => (
          <b key={c}>{c}</b>
        ))}
      </div>
      <div className="numbers">
        {Array.from({ length: 12 }, (_, i) => (
          <b key={i}>{i + 1}</b>
        ))}
      </div>
      <div
        className="board"
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={
          "結晶盤。矢印で移動、Enterで選択。" +
          coord(cursor) +
          " " +
          (atCursor ? formulas[atCursor.k] : "空き")
        }
        onKeyDown={keys}
        onPointerDown={(e) => {
          if (!e.isPrimary || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          down.current = {
            p: point(e.clientX, e.clientY),
            x: e.clientX,
            y: e.clientY,
            id: e.pointerId,
          };
        }}
        onPointerCancel={() => (down.current = null)}
        onPointerUp={(e) => {
          const d = down.current;
          if (!d || d.id !== e.pointerId) return;
          down.current = null;
          const p = point(e.clientX, e.clientY);
          if (p.x < 0 || p.y < 0 || p.x >= N || p.y >= N) return;
          setCursor(p);
          if (dist(p, d.p) === 0) pick(p);
          else if (dist(p, d.p) === 1) drag(d.p, p);
        }}
      >
        <canvas className="scenery" width={576} height={576} ref={bg} />
        <div className="gridlines" />
        <PixiField board={g.board} />
        {g.board
          .filter((b) => b.locked)
          .map((b) => (
            <i className="mark locked" key={b.id} style={pos(b)}>
              <LockKeyhole size={12} />
            </i>
          ))}
        {highlight(cue, "cue")}
        {highlight(ghost, "ghost")}
        {highlight(targets, "destination")}
        {highlight(g.blocked, "blocked")}
        {selected && highlight([selected], "selected")}
        {highlight([unit(cursor)], "cursor")}
        {effect && burst && (
          <div
            key={g.turn + "-" + effect.id}
            className={"burst tier" + burst.rule.tier + (low ? " still" : "")}
            style={
              {
                ...pos(effect),
                "--spark": burst.rule.tier === 4 ? "#fff5a1" : "#acffed",
              } as CSSProperties
            }
          >
            <GrownCrystal b={effect} />
            <div className="aura" />
            {!low &&
              Array.from({ length: burst.rule.tier * 4 + 5 }, (_, i) => (
                <span
                  className="particle"
                  key={i}
                  style={
                    {
                      "--ang": i * 137.5 + "deg",
                      "--reach": 25 + (i % 5) * 9 + burst.rule.tier * 6 + "px",
                    } as CSSProperties
                  }
                >
                  ✦
                </span>
              ))}
            {burst.rule.tier === 4 && <label>✦ RARE BATCH ×2 ✦</label>}
            <strong>{burst.retained ? "LOCK" : "+" + burst.points.toLocaleString()}</strong>
          </div>
        )}
        {burst?.rule.tier === 4 && (
          <div className={"rarePrize" + (low ? " still" : "")}>
            <Art kind="crown" />
            <small>✦ GRAND SYNTHESIS ✦</small>
            <b>混晶バッチ完成!</b>
            <span>
              2 {formulas[burst.rule.product]}　·　+{burst.points.toLocaleString()} pt
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
