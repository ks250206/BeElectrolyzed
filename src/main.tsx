import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowLeftRight,
  AudioLines,
  BookOpen,
  ChevronRight,
  Clock3,
  FlaskConical,
  Gem,
  GraduationCap,
  Layers,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import "./style.css";
import {
  act,
  clock,
  create,
  destinations,
  pause,
  start,
  type Action,
  type Game,
  type Mode,
  type Reaction,
} from "./game/game";
import {
  byProduct,
  endpoints,
  equation,
  formulas,
  recipes,
  shape,
  type Target,
} from "./game/chemistry";
import { at, cell, contains, dirs, dist, inside, type Point, type Rect } from "./game/spatial";
import { Art, Board, coord } from "./ui/Board";
import { sound, unlock } from "./ui/audio";
const title = ["", "二元化合物", "中間化合物", "最終結晶", "混晶バッチ"];
const targetName = { off: "自動回収", MixedX: "Cl / Br 混晶", MixedM: "Ge / Sn 混晶" };
function seed() {
  const v = new URLSearchParams(location.search).get("seed");
  return v !== null && Number.isInteger(Number(v))
    ? Number(v)
    : crypto.getRandomValues(new Uint32Array(1))[0];
}
function read(key: string, alt: string) {
  try {
    return localStorage.getItem("beel-" + key) ?? alt;
  } catch {
    return alt;
  }
}
function save(key: string, val: string) {
  try {
    localStorage.setItem("beel-" + key, val);
  } catch {
    /* Optional storage. */
  }
}
function guide(g: Game): { text: string; action?: Action; cue?: Rect[]; done?: boolean } {
  const a = { x: 0, y: 3 },
    b = { x: 0, y: 2 },
    c = { x: 8, y: 3 },
    d = { x: 8, y: 2 };
  const swap = (from: Point, to: Point, text: string) => ({
    text,
    action: { type: "swap" as const, from, to },
    cue: [cell(from), cell(to)],
  });
  if (g.mode === "attack")
    return {
      text:
        g.turn === 0
          ? "A4 の Li を A3 へ。LiCl を経て最終結晶を回収！"
          : "元素を選ぶと、交換先と合成候補を確認できます。",
      cue: g.turn === 0 ? [cell(a), cell(b)] : [],
    };
  if (g.mode === "collect")
    return g.collected
      ? { text: "自動回収に成功！ 次は2つの結晶を予約して混晶へ。", done: true }
      : swap(a, b, "A4 の Li を選び、直上の A3 に交換。LiCl を作ろう。");
  if (g.batches)
    return { text: "混晶バッチ完成！ 2式量の合成と予約結晶の精算に成功。", done: true };
  if (g.target === "off")
    return {
      text: "「Cl / Br 混晶を予約」を押し、完成前に2枠を確保。",
      action: { type: "reserve", target: "MixedX" },
    };
  const cl = g.board.find((v) => v.locked && v.k === "LPSCl"),
    br = g.board.find((v) => v.locked && v.k === "LPSBr");
  if (!cl) return swap(a, b, "A4 → A3 と交換。塩化物の最終結晶を予約枠に保持。");
  if (!br) return swap(c, d, "I4 → I3 と交換。臭化物の最終結晶も保持しよう。");
  if (g.charges === 1)
    return {
      text: "F1 の ⁶Li を選び「⁶Li を採取」。強制交換のチャージを2に。",
      cue: [cell({ x: 5, y: 0 })],
      action: { type: "harvest", id: at(g.board, { x: 5, y: 0 })!.id },
    };
  return {
    text: "C3 の保持結晶を選び「強制交換」。右隣の E3 を押して2つを接触させよう。",
    action: { type: "shift", id: cl.id, to: { x: 4, y: 2 } },
    cue: [cl, { ...cl, x: 4 }],
  };
}
function sameAction(a: Action, b: Action) {
  if (a.type === "swap" && b.type === "swap")
    return (
      (dist(a.from, b.from) === 0 && dist(a.to, b.to) === 0) ||
      (dist(a.from, b.to) === 0 && dist(a.to, b.from) === 0)
    );
  if (a.type === "shift" && b.type === "shift") return a.id === b.id && dist(a.to, b.to) === 0;
  if (a.type === "reserve" && b.type === "reserve") return a.target === b.target;
  return "id" in a && "id" in b && a.type === b.type && a.id === b.id;
}
function App() {
  const [g, setG] = useState(() => create(seed())),
    live = useRef(g);
  const write = (n: Game) => {
    live.current = n;
    setG(n);
  };
  const [sel, select] = useState<Point | null>(null),
    [shift, setShift] = useState(false),
    [help, setHelp] = useState(false),
    [notice, setNotice] = useState(""),
    [burst, setBurst] = useState<Reaction | null>(null),
    [history, setHistory] = useState<Reaction[]>([]);
  const [mute, setMute] = useState(() => read("mute", "0") === "1"),
    [low, setLow] = useState(
      () => read("low", matchMedia("(prefers-reduced-motion: reduce)").matches ? "1" : "0") === "1",
    ),
    [best, setBest] = useState(() => Number(read("best", "0")) || 0);
  const dialog = useRef<HTMLDialogElement>(null),
    restartDialog = useRef<HTMLDialogElement>(null),
    resumeHelp = useRef(false);
  const prefs = useRef({ mute, low });
  prefs.current = { mute, low };
  const clear = () => {
    select(null);
    setShift(false);
    setNotice("");
  };
  const begin = (mode: Mode) => {
    unlock();
    clear();
    setBurst(null);
    setHistory([]);
    write(
      start(mode === g.mode && g.phase === "ready" ? g : create(seed(), mode), performance.now()),
    );
  };
  useEffect(() => {
    const id = setInterval(() => {
      const s = live.current,
        n = clock(s, performance.now());
      if (Math.ceil(n.remaining / 1000) !== Math.ceil(s.remaining / 1000)) write(n);
    }, 120);
    const hidden = () => {
      if (document.hidden) {
        resumeHelp.current = false;
        write(pause(live.current, performance.now()));
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (g.mode === "attack" && g.score > best) {
      save("best", String(g.score));
      setBest(g.score);
    }
  }, [g.score, g.mode, best]);
  useEffect(() => {
    if (!g.events.length) {
      setBurst(null);
      return;
    }
    const reveal = g.events
      .slice()
      .sort((a, b) => Number(a.rule.tier === 4) - Number(b.rule.tier === 4));
    const timers = reveal.map((r, i) =>
      setTimeout(
        () => {
          setBurst(r);
          if (!prefs.current.mute)
            sound(r.rule.tier >= 3 ? "final" : "wave", r.depth + r.rule.tier - 1);
        },
        i * (prefs.current.low ? 100 : 280),
      ),
    );
    timers.push(
      setTimeout(
        () => setBurst(null),
        timers.length * (prefs.current.low ? 100 : 280) +
          (reveal.some((e) => e.rule.tier === 4) ? 2300 : 950),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [g.events]);
  const lesson = guide(g),
    chosen = sel ? at(g.board, sel) : undefined;
  const active = g.phase === "playing";
  const moves = useMemo(() => {
    if (!sel || !active) return [];
    if (chosen && chosen.w * chosen.h > 1) return shift ? destinations(g, chosen) : [];
    return dirs
      .map(([dx, dy]) => cell({ x: sel.x + dx, y: sel.y + dy }))
      .filter(
        (p) =>
          inside(p) &&
          (at(g.board, p)?.w ?? 1) * (at(g.board, p)?.h ?? 1) === 1 &&
          (chosen || at(g.board, p)),
      );
  }, [sel, active, shift, g.board, g.charges, chosen]);
  const forecast = useMemo(() => {
    if (!sel || !moves.length) return null;
    const results = moves.map((p) => {
      const a: Action =
        shift && chosen
          ? { type: "shift", id: chosen.id, to: p }
          : { type: "swap", from: sel, to: { x: p.x, y: p.y } };
      const n = act(g, a, g.since, false);
      return { p, n, value: n.events.reduce((v, e) => v + e.rule.tier * e.rule.tier, 0) };
    });
    return results.sort((a, b) => b.value - a.value || b.n.blocked.length - a.n.blocked.length)[0];
  }, [sel, moves, shift, chosen, g.target]);
  function dispatch(a: Action) {
    if (!active) return;
    if (g.mode !== "attack" && (!lesson.action || !sameAction(a, lesson.action))) {
      setNotice(lesson.text);
      return;
    }
    unlock();
    const n = act(live.current, a, performance.now());
    if (n.turn !== g.turn && n.events.length)
      setHistory((old) =>
        [
          ...n.events.slice().sort((a, b) => b.rule.tier - a.rule.tier || b.depth - a.depth),
          ...old,
        ].slice(0, 5),
      );
    if (n.turn !== g.turn && !mute && !n.events.length) sound("move");
    write(n);
    clear();
  }
  function pick(p: Point) {
    if (!active) return;
    const destination = moves.find((r) => contains(r, p));
    if (shift && chosen && destination) {
      dispatch({ type: "shift", id: chosen.id, to: destination });
      return;
    }
    if (!shift && sel && destination) {
      dispatch({ type: "swap", from: sel, to: p });
      return;
    }
    if (sel && dist(p, sel) === 0) {
      clear();
      return;
    }
    select(p);
    setNotice("");
    setShift(false);
  }
  function openHelp() {
    resumeHelp.current = active;
    write(pause(live.current, performance.now()));
    setHelp(true);
    dialog.current?.showModal();
  }
  function closeHelp() {
    setHelp(false);
    if (resumeHelp.current && live.current.phase === "paused")
      write(start(live.current, performance.now()));
    resumeHelp.current = false;
  }
  const remaining = Math.ceil(g.remaining / 1000),
    last = history[0],
    time =
      g.mode === "attack"
        ? String(Math.floor(remaining / 60)).padStart(2, "0") +
          ":" +
          String(remaining % 60).padStart(2, "0")
        : "∞";
  const feedback =
    notice ||
    (sel
      ? chosen && chosen.w * chosen.h > 1
        ? formulas[chosen.k] +
          " · " +
          chosen.w +
          "×" +
          chosen.h +
          "　" +
          (shift ? "ハイライトされた長方形を選択" : "固定結晶")
        : forecast?.value
          ? coord(forecast.p) +
            " へ交換 → " +
            forecast.n.events.map((e) => formulas[e.rule.product]).join(" → ")
          : forecast?.n.blocked.length
            ? coord(forecast.p) + " へ交換 · " + forecast.n.message
            : "隣の元素または空きマスを選択"
      : g.message || (last ? equation(last.rule) : "上下左右に1マス交換"));
  function resetPrompt() {
    resumeHelp.current = active;
    write(pause(live.current, performance.now()));
    restartDialog.current?.showModal();
  }
  const lessonButtons = (
    <>
      <button onClick={() => begin("collect")}>
        <GraduationCap /> 回収を練習
      </button>
      <button onClick={() => begin("rare")}>
        <Sparkles /> 混晶を練習
      </button>
    </>
  );
  return (
    <>
      <header>
        <div className="bar">
          <a href="./" className="brand">
            <span>
              <Gem />
            </span>
            Crystal <em>Arcade</em>
          </a>
          <nav>
            <button onClick={openHelp} aria-label="遊び方とレシピ">
              <BookOpen />
              <span>遊び方</span>
            </button>
            <button
              aria-label="効果音"
              aria-pressed={!mute}
              onClick={() => {
                unlock();
                setMute(!mute);
                save("mute", mute ? "0" : "1");
              }}
            >
              {mute ? <VolumeX /> : <AudioLines />}
            </button>
            <button
              aria-label="演出を軽減"
              aria-pressed={low}
              onClick={() => {
                setLow(!low);
                save("low", low ? "0" : "1");
              }}
            >
              <Sparkles />
            </button>
          </nav>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <div className="heroTag">
              <i /> SOLID ELECTROLYTE LAB
            </div>
            <h1>
              Be<span>Electrolyzed</span>
            </h1>
            <p>ひとマスの交換から、きらめく固体電解質へ。</p>
          </div>
          <Art kind="hero" />
        </section>
        <div className="gameLayout">
          <section className="playcard">
            <div className="panelHead">
              <div className="sectionTitle">
                <span className="liveDot" /> REACTION BOARD
              </div>
              <div className="modeTag">
                {g.mode === "attack" ? "TIME ATTACK" : "TRAINING"} <span> / 12 × 12</span>
              </div>
            </div>
            <div className="boardWrap">
              <Board
                g={g}
                selected={sel ? (chosen ?? cell(sel)) : null}
                targets={moves}
                ghost={forecast?.n.events[0]?.outputs ?? []}
                cue={active ? (lesson.cue ?? []) : []}
                pick={pick}
                drag={(from, to) => dispatch({ type: "swap", from, to })}
                cancel={clear}
                low={low}
                burst={active ? burst : null}
              />
              {!active && g.phase !== "ready" && (
                <div className="veil">
                  <div>
                    {g.phase === "ended" ? <Trophy /> : <Pause />}
                    <h2>{g.phase === "ended" ? "Time up!" : "Paused"}</h2>
                    <p>
                      {g.phase === "ended"
                        ? g.score.toLocaleString() +
                          " pt · 回収 " +
                          g.collected +
                          "個 / 混晶 " +
                          g.batches +
                          "組"
                        : "時計を止めています"}
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        g.phase === "paused"
                          ? write(start(live.current, performance.now()))
                          : begin("attack")
                      }
                    >
                      {g.phase === "paused" ? "プレイを再開" : "もう一度遊ぶ"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="boardFoot" aria-live="polite">
              <ArrowLeftRight />
              {feedback}
            </div>
            {active && chosen && (chosen.w * chosen.h > 1 || chosen.k === "Li6") && (
              <div className="tools">
                <strong>{formulas[chosen.k]}</strong>
                {chosen.k === "Li6" ? (
                  <button
                    disabled={g.charges >= 3}
                    onClick={() => dispatch({ type: "harvest", id: chosen.id })}
                  >
                    ⁶Li を採取
                  </button>
                ) : (
                  <button
                    disabled={g.charges < (chosen.locked ? 2 : 1)}
                    onClick={() => setShift(!shift)}
                  >
                    {shift ? "交換をキャンセル" : "強制交換 ⚡" + (chosen.locked ? 2 : 1)}
                  </button>
                )}
                {chosen.locked && (
                  <button onClick={() => dispatch({ type: "release", id: chosen.id })}>回収</button>
                )}
              </div>
            )}
          </section>
          <aside>
            <section className="stats">
              <div>
                <small>
                  <Trophy /> SCORE
                </small>
                <strong>{String(g.score).padStart(6, "0")}</strong>
                <span>BEST　{best.toLocaleString()}</span>
              </div>
              <div>
                <small>
                  <Clock3 /> TIME
                </small>
                <strong>{time}</strong>
                <span>{g.mode === "attack" ? "残り時間" : "時間制限なし"}</span>
              </div>
            </section>
            <section className="card session">
              <h2>
                <span className="chip purple">
                  <Activity />
                </span>
                {g.mode === "attack"
                  ? "タイムアタック"
                  : g.mode === "rare"
                    ? "混晶を練習"
                    : "回収を練習"}
              </h2>
              <p>
                {g.phase === "ready"
                  ? "180秒で結晶を合成。まずは Li と Cl をつなげよう。"
                  : lesson.text}
              </p>
              {g.phase === "ready" ? (
                <>
                  <button className="primary wide" onClick={() => begin("attack")}>
                    <Play /> プレイ開始
                  </button>
                  <div className="smallButtons">{lessonButtons}</div>
                </>
              ) : g.mode !== "attack" && lesson.done ? (
                <button
                  className="primary wide"
                  onClick={() => begin(g.mode === "collect" ? "rare" : "attack")}
                >
                  {g.mode === "collect" ? "混晶の練習へ" : "タイムアタックへ"}
                  <ChevronRight />
                </button>
              ) : (
                <>
                  {g.mode === "rare" && g.target === "off" && (
                    <button
                      className="primary wide"
                      disabled={!active}
                      onClick={() => dispatch({ type: "reserve", target: "MixedX" })}
                    >
                      Cl / Br 混晶を予約
                    </button>
                  )}
                  <div className="smallButtons">
                    <button
                      onClick={() =>
                        g.phase === "ended"
                          ? begin("attack")
                          : active
                            ? write(pause(g, performance.now()))
                            : write(start(g, performance.now()))
                      }
                    >
                      {active ? <Pause /> : <Play />}
                      {active ? "一時停止" : g.phase === "ended" ? "再プレイ" : "再開"}
                    </button>
                    <button onClick={resetPrompt}>
                      <RotateCcw /> やり直す
                    </button>
                  </div>
                </>
              )}
            </section>
            <section className="card locks">
              <h2>
                <span className="chip mint">
                  <LockKeyhole />
                </span>
                結晶の予約
              </h2>
              <label>
                合成前に選択
                <select
                  aria-label="予約する混晶"
                  value={g.target}
                  disabled={!active || g.board.some((b) => b.locked)}
                  onChange={(e) => dispatch({ type: "reserve", target: e.target.value as Target })}
                >
                  {Object.entries(targetName).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <div className="slots">
                {(g.target === "off" ? [null, null] : endpoints[g.target]).map((k, i) => {
                  const b = g.board.find((v) => v.k === k && v.locked);
                  return (
                    <div key={i} className={b ? "filled" : ""}>
                      {b ? <Art kind={b.k} /> : <Gem />}
                      <span>{k ? formulas[k] : "未予約"}</span>
                      {b && (
                        <button
                          disabled={!active}
                          onClick={() => dispatch({ type: "release", id: b.id })}
                        >
                          回収
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="card charge">
              <h2>
                <span className="chip gold">
                  <Zap />
                </span>
                強制交換 <b>{g.charges} / 3</b>
              </h2>
              <div className="meter">
                {[1, 2, 3].map((n) => (
                  <i className={n <= g.charges ? "on" : ""} key={n} />
                ))}
              </div>
              <p>⁶Li を採取して充電。固定結晶を隣の同じ広さの区画と交換できます。</p>
            </section>
          </aside>
        </div>
        <section
          className={"journal " + (last?.rule.tier === 4 ? "rareLog" : "")}
          aria-live="polite"
        >
          <span className="chip purple">
            <FlaskConical />
          </span>
          <div>
            <small>REACTION LOG</small>
            <b>
              {last
                ? (last.rule.tier === 4 ? "混晶完成 · 2式量　" : "") + equation(last.rule)
                : "合成の記録"}
            </b>
            {last && (
              <small>
                {last.depth} CHAIN ·{" "}
                {last.retained ? "予約枠に保持" : "+" + last.points.toLocaleString() + " pt"}
              </small>
            )}
          </div>
          {last?.rule.tier === 4 ? (
            <Art kind="crown" />
          ) : (
            <button onClick={openHelp}>
              <Layers /> レシピ
            </button>
          )}
        </section>
        <footer>
          <span>Crystal Arcade</span>
          <i>✦</i> BeElectrolyzed
        </footer>
      </main>
      <dialog ref={dialog} onClose={closeHelp}>
        <div className="modalHead">
          <h2>
            <BookOpen /> 遊び方と合成表
          </h2>
          <button aria-label="閉じる" onClick={() => dialog.current?.close()}>
            <X />
          </button>
        </div>
        {help && (
          <>
            <p>
              元素同士または元素と空きマスを2回タップ、または隣へ短くドラッグ。キーボードは盤面に
              Tab で移動し、矢印と Enter で選択、Esc で解除。
            </p>
            <p>
              各材料は辺でつながる必要があります。点線は交換候補、ミントの網掛けは推奨手の生成位置。空き不足の材料は赤枠です。重力はなく、連鎖の後に元素を補充します。
            </p>
            <p>
              最終結晶は自動回収。予約した各種1個だけ保持し、回収・混晶化・時間切れのいずれかで基礎点を精算します。⁶Li
              は Li として使うか、採取して強制交換に使えます。
            </p>
            <div className="smallButtons">
              {(["collect", "rare"] as const).map((m, i) => (
                <button
                  key={m}
                  onClick={() => {
                    resumeHelp.current = false;
                    dialog.current?.close();
                    begin(m);
                  }}
                >
                  {i ? "混晶" : "回収"}を練習
                </button>
              ))}
            </div>
            {[1, 2, 3, 4].map((t) => (
              <section className="recipeGroup" key={t}>
                <h3>
                  {title[t]} <small>{shape(t as 1 | 2 | 3 | 4)}</small>
                </h3>
                {recipes
                  .filter((r) => r.tier === t)
                  .map((r) => (
                    <p key={r.product}>
                      {equation(r)} <b>{r.points.toLocaleString()} pt</b>
                    </p>
                  ))}
              </section>
            ))}
            <p>
              P₂S₅
              は組成式です。混晶は2式量を1バッチとして扱います。反応式は組成の収支を示し、実際の合成条件・速度や伝導率を表すものではありません。
            </p>
          </>
        )}
      </dialog>
      <dialog
        ref={restartDialog}
        onCancel={() => {
          if (resumeHelp.current) write(start(live.current, performance.now()));
        }}
      >
        <h2>プレイをやり直す？</h2>
        <p>今回の盤面を終了し、最初からスタートします。</p>
        <div className="smallButtons">
          <button
            onClick={() => {
              restartDialog.current?.close();
              if (resumeHelp.current) write(start(live.current, performance.now()));
            }}
          >
            戻る
          </button>
          <button
            onClick={() => {
              restartDialog.current?.close();
              begin(g.mode);
            }}
          >
            やり直す
          </button>
          <button
            onClick={() => {
              restartDialog.current?.close();
              clear();
              setHistory([]);
              write(create(seed()));
            }}
          >
            タイトルへ
          </button>
        </div>
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
