import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowLeftRight,
  AudioLines,
  BookOpen,
  ChevronRight,
  Clock3,
  Droplet,
  FlaskConical,
  Gem,
  GraduationCap,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
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
  isTimed,
  waterArea,
  WATER_THRESHOLD,
  pause,
  start,
  type Action,
  type Game,
  type Mode,
  type Reaction,
} from "./game/game";
import { collectible, collectionValue, equation, formulas, recipes, shape } from "./game/chemistry";
import {
  at,
  cell,
  contains,
  dirs,
  dist,
  inside,
  vacantCells,
  type Point,
  type Rect,
} from "./game/spatial";
import { CrystalResult } from "./ui/CrystalResult";
import { Art, Board, coord } from "./ui/Board";
import { sound, unlock } from "./ui/audio";
const title = ["", "二元化合物", "中間化合物", "最終結晶", "混晶バッチ"];

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
  if (g.mode === "random")
    return { text: "元素から合成をスタート。隣のマスと交換して、Li₂S や P₂S₅ を作ろう。" };
  if (g.mode === "attack")
    return {
      text:
        g.turn === 0
          ? "A4 の Li を A3 へ。LiCl を経て最終結晶を作ろう！"
          : "輝く最終結晶をタップして回収。混晶を狙うなら盤面に残そう。",
      cue: g.turn === 0 ? [cell(a), cell(b)] : [],
    };
  const cl = g.board.find((b) => b.k === "LPSCl"),
    br = g.board.find((b) => b.k === "LPSBr");
  const pickup = (b: NonNullable<typeof cl>) => ({
    text: coord(b) + " の " + formulas[b.k] + " をタップして回収！",
    action: { type: "collect" as const, id: b.id },
    cue: [b],
  });
  if (g.mode === "collect")
    return g.collected
      ? { text: "回収に成功！ 次は2つの最終結晶から混晶を作ろう。", done: true }
      : cl
        ? pickup(cl)
        : swap(a, b, "A4 の Li を選び、直上の A3 に交換。LiCl を作ろう。");
  const batch = g.board.find((b) => b.k === "MixedX");
  if (batch) return pickup(batch);
  if (g.batches) return { text: "混晶2式量を1バッチとして回収しました！", done: true };
  if (!cl) return swap(a, b, "A4 → A3 と交換。完成した塩化物を盤面に残そう。");
  if (!br) return swap(c, d, "I4 → I3 と交換。臭化物も作って混晶へ。");
  if (g.charges === 1)
    return {
      text: "F1 の ⁶Li を選び「⁶Li を採取」。強制交換のチャージを2に。",
      cue: [cell({ x: 5, y: 0 })],
      action: { type: "harvest", id: at(g.board, { x: 5, y: 0 })!.id },
    };
  return {
    text: "「強制交換」を押し、C3 の結晶 → 点線の E3 の順に選んで混晶を作ろう。",
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
    [tool, setTool] = useState<"shift" | "water" | "solution" | null>(null),
    [help, setHelp] = useState(false),
    [notice, setNotice] = useState(""),
    [burst, setBurst] = useState<Reaction | null>(null),
    [history, setHistory] = useState<Reaction[]>([]);
  const [mute, setMute] = useState(() => read("mute", "0") === "1"),
    [low, setLow] = useState(
      () => read("low", matchMedia("(prefers-reduced-motion: reduce)").matches ? "1" : "0") === "1",
    ),
    [records, setRecords] = useState(() => ({
      attack: Number(read("best", "0")) || 0,
      random: Number(read("best-random", "0")) || 0,
    }));
  const recordMode = g.mode === "random" ? "random" : "attack";
  const best = records[recordMode];
  const dialog = useRef<HTMLDialogElement>(null),
    restartDialog = useRef<HTMLDialogElement>(null),
    resumeHelp = useRef(false);
  const prefs = useRef({ mute, low });
  prefs.current = { mute, low };
  const clear = () => {
    select(null);
    setTool(null);
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
    if (isTimed(g.mode) && g.score > best) {
      save(recordMode === "random" ? "best-random" : "best", String(g.score));
      setRecords((previous) => ({ ...previous, [recordMode]: g.score }));
    }
  }, [g.score, g.mode, best, recordMode]);
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
  useEffect(() => {
    if (g.pickups.length && !prefs.current.mute)
      sound("collect", g.pickups.some((b) => b.units === 2) ? 4 : 1);
  }, [g.pickups]);
  const finals = g.board.filter((b) => collectible(b.k));
  const lesson = guide(g),
    chosen = sel && (!tool || tool === "shift") ? at(g.board, sel) : undefined;
  const active = g.phase === "playing";
  const waterPreview = active && tool === "water" && sel ? waterArea(g.board, sel) : null;
  const emptyCells = useMemo(() => vacantCells(g.board), [g.board]);
  const vacancies = emptyCells.length;
  function toggleTool(next: NonNullable<typeof tool>) {
    if (next !== "shift" || tool === next || !chosen || chosen.w * chosen.h === 1) select(null);
    setNotice("");
    setTool(tool === next ? null : next);
  }
  const moves = useMemo(() => {
    if (!sel || !active) return [];
    if (tool === "shift" && chosen) return destinations(g, chosen);
    if (tool || (chosen && chosen.w * chosen.h > 1)) return [];
    return dirs
      .map(([dx, dy]) => cell({ x: sel.x + dx, y: sel.y + dy }))
      .filter(
        (p) =>
          inside(p) &&
          (at(g.board, p)?.w ?? 1) * (at(g.board, p)?.h ?? 1) === 1 &&
          (chosen || at(g.board, p)),
      );
  }, [sel, active, g.board, g.charges, chosen, tool]);
  const forecast = useMemo(() => {
    if (!sel || !moves.length) return null;
    const results = moves.map((p) => {
      const a: Action =
        tool === "shift" && chosen
          ? { type: "shift", id: chosen.id, to: p }
          : { type: "swap", from: sel, to: { x: p.x, y: p.y } };
      const n = act(g, a, g.since, false);
      return { p, n, value: n.events.reduce((v, e) => v + e.rule.tier * e.rule.tier, 0) };
    });
    return results.sort((a, b) => b.value - a.value || b.n.blocked.length - a.n.blocked.length)[0];
  }, [sel, moves, tool, chosen]);
  function dispatch(a: Action) {
    if (!active) return;
    if (!isTimed(g.mode) && (!lesson.action || !sameAction(a, lesson.action))) {
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
    if (n.turn !== g.turn && !mute && !n.events.length && !n.pickups.length) sound("move");
    write(n);
    clear();
  }
  function pick(p: Point) {
    const crystal = at(g.board, p);
    if (g.phase === "ready" && crystal) {
      begin(g.mode);
      select(p);
      return;
    }
    if (!active) return;
    if (tool === "water") {
      if (sel && dist(sel, p) === 0) {
        if (waterPreview?.crystals.length) dispatch({ type: "dissolve", center: p });
      } else select(p);
      return;
    }
    if (tool === "solution") return;
    const destination = moves.find((r) => contains(r, p));
    if (tool === "shift") {
      if (chosen && destination) dispatch({ type: "shift", id: chosen.id, to: destination });
      else if (crystal && crystal.w * crystal.h > 1) {
        select({ x: crystal.x, y: crystal.y });
        setNotice("");
      }
      return;
    }
    if (crystal && collectible(crystal.k)) {
      dispatch({ type: "collect", id: crystal.id });
      return;
    }
    if (sel && destination) {
      dispatch({ type: "swap", from: sel, to: p });
      return;
    }
    if (sel && dist(p, sel) === 0) {
      clear();
      return;
    }
    select(p);
    setNotice("");
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
    time = isTimed(g.mode)
      ? String(Math.floor(remaining / 60)).padStart(2, "0") +
        ":" +
        String(remaining % 60).padStart(2, "0")
      : "∞";
  const feedback =
    (g.phase === "ended" ? g.message : "") ||
    (active && tool === "water"
      ? waterPreview && sel
        ? coord(sel) +
          " · " +
          waterPreview.crystals.length +
          "個が対象。" +
          (waterPreview.crystals.length
            ? "同じマスをもう一度押すか「溶かす」で確定"
            : "別の場所を選んでください")
        : "盤面を押して溶かす3×3の範囲を選択"
      : "") ||
    (active && tool === "solution" ? "空き" + vacancies + "マスすべてに元素を晶出させます" : "") ||
    notice ||
    (active && tool === "shift"
      ? !chosen
        ? "動かす固定結晶を選択。通常は⚡1、最終結晶・混晶は⚡2"
        : collectible(chosen.k) && g.charges < 2
          ? "この結晶には2チャージ必要です。別の固定結晶を選べます"
          : formulas[chosen.k] +
            (moves.length ? " · 点線の移動先を選択" : " · 隣に丸ごと交換できる区画がありません")
      : "") ||
    (sel
      ? chosen && chosen.w * chosen.h > 1
        ? formulas[chosen.k] + " · " + chosen.w + "×" + chosen.h + "　固定結晶"
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
                {g.mode === "random" ? "RANDOM" : g.mode === "attack" ? "TIME ATTACK" : "TRAINING"}{" "}
                <span> / 12 × 12</span>
              </div>
            </div>
            <div className="boardWrap">
              <Board
                g={g}
                waterPreview={waterPreview}
                solutionPreview={active && tool === "solution" ? emptyCells : []}
                aiming={active && (tool === "water" || tool === "shift") ? tool : null}
                selected={sel && (!tool || tool === "shift") ? (chosen ?? cell(sel)) : null}
                targets={moves}
                ghost={forecast?.n.events[0]?.outputs ?? []}
                cue={active && (!tool || tool === "shift") ? (lesson.cue ?? []) : []}
                pick={pick}
                drag={(from, to) => {
                  if (!tool) dispatch({ type: "swap", from, to });
                }}
                cancel={clear}
                low={low}
                burst={active ? burst : null}
              />
              {!active && g.phase !== "ready" && (
                <div
                  className={
                    "veil" + (g.phase === "ended" && g.pickups.length ? " afterPickup" : "")
                  }
                >
                  {g.phase === "ended" ? (
                    <div className="resultCard">
                      <div>
                        <p className="resultCaption">
                          <Trophy /> Time up! · 最終スコア
                        </p>
                        <h2 className="resultScore">
                          <span className="sr-only">最終スコア </span>
                          {g.score.toLocaleString("ja-JP")} <small>pt</small>
                        </h2>
                        <p className="resultCounts">
                          回収 {g.collected}個 · 混晶 {g.batches}組
                        </p>
                      </div>
                      <CrystalResult made={g.made} />
                      <button className="primary" onClick={() => begin(g.mode)}>
                        もう一度遊ぶ
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Pause />
                      <h2>Paused</h2>
                      <p>時計を止めています</p>
                      <button
                        className="primary"
                        onClick={() => write(start(live.current, performance.now()))}
                      >
                        プレイを再開
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="itemTray" role="group" aria-label="盤面の道具">
              <button
                title="固定結晶を隣の同じ広さの区画と交換。通常は1、最終結晶・混晶は2チャージ"
                aria-pressed={tool === "shift"}
                disabled={!active || !g.charges}
                onClick={() => toggleTool("shift")}
              >
                <Zap />
                <span>強制交換</span>
                <b>{g.charges}/3</b>
              </button>
              <button
                title="二元化合物6個で1滴。3×3の結晶を溶かす"
                aria-pressed={tool === "water"}
                disabled={!active || !isTimed(g.mode) || g.water < WATER_THRESHOLD}
                onClick={() => toggleTool("water")}
              >
                <Droplet />
                <span>H₂Oボム</span>
                <b>
                  {g.water}/{WATER_THRESHOLD}
                </b>
              </button>
              <button
                title="空きマスすべてに元素を晶出。タイムアタックごとに1瓶"
                aria-pressed={tool === "solution"}
                disabled={!active || !isTimed(g.mode) || !g.solution || !vacancies}
                onClick={() => toggleTool("solution")}
              >
                <FlaskConical />
                <span>過飽和溶液</span>
                <b>×{isTimed(g.mode) ? g.solution : 0}</b>
              </button>
            </div>
            <div className="boardFoot">
              <ArrowLeftRight />
              <span role="status">{feedback}</span>
              {active && !tool && chosen?.k === "Li6" && (
                <button
                  disabled={g.charges >= 3}
                  onClick={() => dispatch({ type: "harvest", id: chosen.id })}
                >
                  ⁶Li を採取
                </button>
              )}
              {waterPreview && sel && (
                <button
                  disabled={!waterPreview.crystals.length}
                  onClick={() => dispatch({ type: "dissolve", center: sel })}
                >
                  溶かす
                </button>
              )}
              {active && tool === "solution" && (
                <button onClick={() => dispatch({ type: "crystallize" })}>
                  {vacancies}マスを埋める
                </button>
              )}
            </div>
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
                <span>{isTimed(g.mode) ? "残り時間" : "時間制限なし"}</span>
              </div>
            </section>
            <section className="card session">
              <h2>
                <span className="chip purple">
                  <Activity />
                </span>
                {g.mode === "attack"
                  ? "タイムアタック"
                  : g.mode === "random"
                    ? "完全ランダム"
                    : g.mode === "rare"
                      ? "混晶を練習"
                      : "回収を練習"}
              </h2>
              <p>
                {g.phase === "ready"
                  ? "結晶をタップすると180秒のゲーム開始。まずは A4 の Li を A3 へ。"
                  : lesson.text}
              </p>
              {g.phase === "ready" ? (
                <>
                  <div className="smallButtons">
                    <button className="primary" onClick={() => begin("attack")}>
                      <Play /> プレイ開始
                    </button>
                    <button onClick={() => begin("random")}>
                      <Shuffle /> 完全ランダム
                    </button>
                  </div>
                  <div className="smallButtons practiceButtons">{lessonButtons}</div>
                </>
              ) : !isTimed(g.mode) && lesson.done ? (
                <button
                  className="primary wide"
                  onClick={() => begin(g.mode === "collect" ? "rare" : "attack")}
                >
                  {g.mode === "collect" ? "混晶の練習へ" : "タイムアタックへ"}
                  <ChevronRight />
                </button>
              ) : (
                <>
                  <div className="smallButtons">
                    <button
                      onClick={() =>
                        g.phase === "ended"
                          ? begin(g.mode)
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
            <section className="card finals">
              <h2>
                <span className="chip mint">
                  <Gem />
                </span>
                最終結晶
              </h2>
              <p>輝く結晶をタップして回収。混晶を狙うなら、対応する2種を隣り合わせよう。</p>
              {finals.length > 0 && (
                <ul>
                  {finals.map((b) => (
                    <li key={b.id}>
                      <span>
                        {formulas[b.k]} <small>{collectionValue(b.k).toLocaleString()} pt</small>
                      </span>
                      <b>{coord(b)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {lesson.done && (
              <div className="practiceResult">
                <CrystalResult made={g.made} />
              </div>
            )}
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
                {last.rule.tier >= 3 ? "合成完了" : "+" + last.points.toLocaleString() + " pt"}
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
              最終結晶と混晶はタップで回収して得点。時間切れには盤面に残った分をまとめて回収します。盤面下の「強制交換」を押してから固定結晶と点線の移動先を順に選びます。通常は1チャージ、最終結晶・混晶は2チャージ。対応する2種が隣り合うと混晶になります。⁶Li
              は Li として使うか、採取して強制交換に使えます。
            </p>
            <p>
              H₂Oボムは二元化合物6個で1滴。ボタンを押し、同じマスを2回選ぶと3×3の範囲で青く光った結晶が溶けて新しい元素になります。範囲をまたぐ結晶・最終結晶・空きマスはそのままです。過飽和溶液は最初から1瓶。空きマスすべてに元素を晶出させます。
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
                      {equation(r)}{" "}
                      <b>
                        {r.tier >= 3 ? "回収 " : ""}
                        {(r.tier >= 3 ? collectionValue(r.product) : r.points).toLocaleString()} pt
                      </b>
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
