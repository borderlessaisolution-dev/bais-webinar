"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import type { WebinarConfig } from "@/lib/config";
import type { Activity, ChatMsg, LiveState, Order, Registration, SessionAvail } from "@/lib/types";
import { api, dec, enc, fmtDate, money } from "@/lib/client";
import {
  ChatInput,
  ChatList,
  FloaterLayer,
  Leaderboard,
  ResultBars,
  Stage,
  TILES,
  TimerRing,
  useFloaters,
  useRemaining,
} from "@/components/live";

const KEY = "bais-host-key";

export default function Host({ w }: { w: WebinarConfig }) {
  const [hostKey, setHostKey] = useState("");
  const [input, setInput] = useState("");
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [err, setErr] = useState("");

  const enter = useCallback(
    async (k: string) => {
      setErr("");
      try {
        const r = await api<{ token: string; url: string }>("/api/host/token", { slug: w.slug }, k);
        localStorage.setItem(KEY, k);
        setHostKey(k);
        setConn(r);
      } catch (e) {
        setErr((e as Error).message);
        localStorage.removeItem(KEY);
      }
    },
    [w.slug]
  );

  useEffect(() => {
    const k = localStorage.getItem(KEY);
    if (k) enter(k);
  }, [enter]);

  if (!conn)
    return (
      <main className="grid min-h-dvh place-items-center bg-ink p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enter(input);
          }}
          className="w-full max-w-sm rounded-2xl bg-white p-6"
        >
          <p className="text-xs font-semibold text-slate-400">BAIS Webinar</p>
          <h1 className="text-xl font-bold">老师控制台 · {w.title}</h1>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Host key"
            className="mt-5 w-full rounded-xl border border-slate-200 px-3.5 py-3 outline-none focus:border-brand"
          />
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          <button className="mt-4 w-full rounded-xl bg-brand py-3 font-bold text-white">进入</button>
        </form>
      </main>
    );

  return (
    <LiveKitRoom serverUrl={conn.url} token={conn.token} connect audio={false} video={false} className="min-h-dvh">
      <HostRoom w={w} hostKey={hostKey} />
    </LiveKitRoom>
  );
}

function HostRoom({ w, hostKey }: { w: WebinarConfig; hostKey: string }) {
  const room = useRoomContext();
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [state, setState] = useState<LiveState>({ kind: "idle", v: 0 });
  const [answered, setAnswered] = useState(0);
  const [hostCounts, setHostCounts] = useState<number[] | null>(null);
  const [acts, setActs] = useState<Activity[]>([]);
  const [lastId, setLastId] = useState<string | null>(null);
  const [tab, setTab] = useState<"ctrl" | "bank" | "sales" | "regs">("ctrl");
  const [offer, setOffer] = useState({ open: false, v: 0 });
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [count, setCount] = useState(0);
  const [mediaErr, setMediaErr] = useState("");
  const floaters = useFloaters();
  const busy = useRef(false);

  const loadActs = useCallback(async () => {
    const r = await api<{ activities: Activity[] }>(`/api/host/activities?slug=${w.slug}`, undefined, hostKey);
    setActs(r.activities);
  }, [w.slug, hostKey]);

  // ---- 广播 ----
  const stateCh = useDataChannel("state");
  const sendRef = useRef(stateCh.send);
  useEffect(() => {
    sendRef.current = stateCh.send;
  });
  const broadcast = useCallback(
    (s: LiveState) => sendRef.current(enc.encode(JSON.stringify(s)), { reliable: true, topic: "state" }).catch(() => {}),
    []
  );

  const offerCh = useDataChannel("offer");
  const offerSend = useRef(offerCh.send);
  useEffect(() => {
    offerSend.current = offerCh.send;
  });
  const toggleOffer = useCallback(
    async (open: boolean) => {
      const r = await api<{ offer: { open: boolean; v: number } }>("/api/host/offer", { slug: w.slug, open }, hostKey);
      setOffer(r.offer);
      offerSend.current(enc.encode(JSON.stringify(r.offer)), { reliable: true, topic: "offer" }).catch(() => {});
    },
    [w.slug, hostKey]
  );

  // 所有动作排队一个一个做，避免「刷新票数」和「开始下一题」互相盖掉
  const queue = useRef<Promise<void>>(Promise.resolve());
  const stateRef = useRef(state);
  const act = useCallback(
    (action: string, activityId?: string) => {
      if (action === "refresh" && busy.current) return queue.current;
      if (action !== "refresh") busy.current = true;
      const run = async () => {
        try {
          const r = await api<{ state: LiveState; answered: number; hostCounts?: number[] }>(
            "/api/host/state",
            { slug: w.slug, action, activityId },
            hostKey
          );
          setAnswered(r.answered);
          if (action === "start") setHostCounts(null);
          if (r.hostCounts) setHostCounts(r.hostCounts);
          if (r.state.v !== stateRef.current.v) broadcast(r.state);
          stateRef.current = r.state;
          setState(r.state);
          if (action === "start" && activityId) setLastId(activityId);
        } catch (e) {
          console.error(e);
        } finally {
          if (action !== "refresh") busy.current = false;
        }
      };
      queue.current = queue.current.then(run);
      return queue.current;
    },
    [w.slug, hostKey, broadcast]
  );

  useEffect(() => {
    loadActs();
    act("refresh");
    api<{ offer: { open: boolean; v: number } }>(`/api/state?slug=${w.slug}`).then((r) => r.offer && setOffer(r.offer)).catch(() => {});
    const upd = () => setCount(Math.max(0, room.numParticipants - 1));
    upd();
    const t = setInterval(upd, 3000);
    room.on(RoomEvent.ParticipantConnected, upd).on(RoomEvent.ParticipantDisconnected, upd);
    return () => {
      clearInterval(t);
      room.off(RoomEvent.ParticipantConnected, upd).off(RoomEvent.ParticipantDisconnected, upd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 进行中：每 2 秒刷新票数；时间到自动截止 / 公布 ----
  const remaining = useRemaining(state, 0);
  const live = (state.kind === "poll" && !state.closed) || (state.kind === "quiz" && state.phase === "question");
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => act("refresh"), 2000);
    return () => clearInterval(t);
  }, [live, act, state.v]);
  const autoDone = useRef<string>("");
  useEffect(() => {
    if (!live || remaining > 0 || !("activity" in state)) return;
    const tag = state.activity.id + state.startedAt;
    if (autoDone.current === tag) return;
    autoDone.current = tag;
    const action = state.kind === "poll" ? "close" : "reveal";
    const id = state.activity.id;
    // 时间到：投票自动截止；抢答多等 1.5 秒（网络宽限）再自动公布
    setTimeout(() => {
      const cur = stateRef.current;
      if ("activity" in cur && cur.activity.id === id) act(action);
    }, action === "reveal" ? 1500 : 0);
  }, [live, remaining, state, act]);

  // ---- 聊天 / 表情 ----
  const pushMsg = (m: ChatMsg) => setMsgs((c) => [...c.slice(-200), m]);
  const chat = useDataChannel("chat", (m) => {
    try {
      const p = JSON.parse(dec.decode(m.payload));
      pushMsg({ id: p.id, text: String(p.text).slice(0, 200), name: m.from?.name || "学员", ts: Date.now() });
    } catch {}
  });
  const react = useDataChannel("react", (m) => floaters.add(dec.decode(m.payload).slice(0, 4)));
  function sendChat(text: string) {
    const id = crypto.randomUUID();
    chat.send(enc.encode(JSON.stringify({ id, text })), { reliable: true, topic: "chat" }).catch(() => {});
    pushMsg({ id, text, name: "老师", host: true, ts: Date.now() });
  }
  function sendEmoji(e: string) {
    floaters.add(e);
    react.send(enc.encode(e), { reliable: false, topic: "react" }).catch(() => {});
  }

  async function toggle(kind: "cam" | "mic" | "screen") {
    setMediaErr("");
    try {
      if (kind === "cam") await localParticipant.setCameraEnabled(!isCameraEnabled);
      if (kind === "mic") await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      if (kind === "screen") await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, { audio: true });
    } catch (e) {
      setMediaErr("开不了：" + (e as Error).message);
    }
  }

  const nextAct = (() => {
    const i = acts.findIndex((a) => a.id === lastId);
    return acts[i + 1] ?? null;
  })();

  const btn = (on: boolean) =>
    `flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${on ? "bg-emerald-600 text-white" : "bg-slate-800 text-white/80"}`;

  return (
    <div className="min-h-dvh bg-slate-100 lg:grid lg:h-dvh lg:grid-cols-[1.25fr_1fr]">
      {/* 左：画面 + 聊天 */}
      <section className="flex flex-col bg-ink lg:min-h-0">
        <div className="flex items-center gap-2 px-4 py-2 text-white">
          <p className="flex-1 truncate font-semibold">🎙 老师控制台 · {w.title}</p>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs tabular-nums">👀 {count} 人在线</span>
        </div>
        <div className="relative">
          <Stage waitingText="打开摄像头或分享屏幕，学员就会看到你" />
          <FloaterLayer items={floaters.items} />
        </div>
        <div className="flex gap-2 p-3">
          <button onClick={() => toggle("cam")} className={btn(isCameraEnabled)}>
            {isCameraEnabled ? "📷 摄像头 开" : "📷 摄像头 关"}
          </button>
          <button onClick={() => toggle("mic")} className={btn(isMicrophoneEnabled)}>
            {isMicrophoneEnabled ? "🎤 麦克风 开" : "🎤 麦克风 关"}
          </button>
          <button onClick={() => toggle("screen")} className={btn(isScreenShareEnabled)}>
            {isScreenShareEnabled ? "🖥 分享中" : "🖥 分享屏幕"}
          </button>
        </div>
        {mediaErr && <p className="px-4 pb-2 text-sm text-red-300">{mediaErr}</p>}
        <div className="flex min-h-[260px] flex-1 flex-col bg-white lg:min-h-0">
          <p className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">💬 聊天室（{msgs.length}）</p>
          <div className="flex min-h-0 flex-1 flex-col">
            <ChatList msgs={msgs} />
          </div>
          <ChatInput onSend={sendChat} onEmoji={sendEmoji} />
        </div>
      </section>

      {/* 右：互动控制 */}
      <section className="flex flex-col lg:min-h-0">
        <div className="flex border-b border-slate-200 bg-white text-sm font-semibold">
          {(
            [
              ["ctrl", "⚡ 互动控制"],
              ["bank", `📝 题库（${acts.length}）`],
              ["sales", "💰 课程报名"],
              ["regs", "👥 名单"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-3 ${tab === k ? "border-b-2 border-brand text-brand" : "text-slate-400"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "ctrl" && (
            <Control
              state={state}
              remaining={remaining}
              answered={answered}
              hostCounts={hostCounts}
              acts={acts}
              nextAct={nextAct}
              act={act}
              viewers={count}
              offer={offer}
              toggleOffer={toggleOffer}
              w={w}
              hostKey={hostKey}
            />
          )}
          {tab === "sales" && <Sales w={w} hostKey={hostKey} offer={offer} toggleOffer={toggleOffer} />}
          {tab === "bank" && <Bank w={w} hostKey={hostKey} acts={acts} reload={loadActs} act={act} goCtrl={() => setTab("ctrl")} />}
          {tab === "regs" && <Regs w={w} hostKey={hostKey} />}
        </div>
      </section>
    </div>
  );
}

function Control({
  state,
  remaining,
  answered,
  hostCounts,
  acts,
  nextAct,
  act,
  viewers,
  offer,
  toggleOffer,
  w,
  hostKey,
}: {
  offer: { open: boolean; v: number };
  toggleOffer: (open: boolean) => Promise<void>;
  w: WebinarConfig;
  hostKey: string;
  state: LiveState;
  remaining: number;
  answered: number;
  hostCounts: number[] | null;
  acts: Activity[];
  nextAct: Activity | null;
  act: (a: string, id?: string) => Promise<void>;
  viewers: number;
}) {
  const [resetArm, setResetArm] = useState(false);
  const B = "rounded-xl px-4 py-3 font-bold transition active:scale-[0.98]";
  const nextBtn = nextAct && (
    <button onClick={() => act("start", nextAct.id)} className={`${B} w-full bg-brand text-white`}>
      ▶ 下一题：{nextAct.type === "quiz" ? "⚡" : "📊"} {nextAct.question.slice(0, 24)}
    </button>
  );

  return (
    <div className="space-y-4">
      <OfferToggle w={w} hostKey={hostKey} offer={offer} toggleOffer={toggleOffer} />
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        {state.kind === "idle" && (
          <div className="py-4 text-center">
            <p className="text-lg font-bold">现在没有互动</p>
            <p className="mt-1 text-sm text-slate-500">学员看到的是直播画面 + 聊天室</p>
          </div>
        )}

        {(state.kind === "poll" || state.kind === "quiz") && (
          <>
            <div className="mb-3 flex items-center gap-3">
              {((state.kind === "quiz" && state.phase === "question") || (state.kind === "poll" && !state.closed)) && (
                <TimerRing ms={remaining} total={state.activity.duration_sec * 1000} />
              )}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-400">
                  {state.kind === "poll" ? (state.closed ? "📊 投票 · 已截止" : "📊 投票进行中") : state.phase === "reveal" ? "⚡ 抢答 · 已公布" : "⚡ 抢答进行中"}
                </span>
                <h3 className="font-bold leading-snug">{state.activity.question}</h3>
              </div>
              <div className="text-right">
                <div className="text-2xl font-extrabold tabular-nums">{answered}</div>
                <div className="text-[11px] text-slate-400">/ {viewers} 人作答</div>
              </div>
            </div>
            <ResultBars
              options={state.activity.options}
              counts={state.kind === "quiz" && state.phase === "question" ? hostCounts ?? state.counts : state.counts}
              correctIndex={state.kind === "quiz" && state.phase === "reveal" ? state.correctIndex : null}
              kahoot={state.kind === "quiz"}
            />
            {state.kind === "quiz" && state.phase === "question" && (
              <p className="mt-1 text-xs text-slate-400">（抢答进行中，票数只有你看得到）</p>
            )}
          </>
        )}

        {state.kind === "leaderboard" && (
          <>
            <h3 className="mb-4 text-center text-lg font-extrabold">🏆 排行榜 Top 10</h3>
            <Leaderboard top={state.top} />
          </>
        )}
      </div>

      <div className="grid gap-2">
        {state.kind === "poll" && !state.closed && (
          <button onClick={() => act("close")} className={`${B} bg-slate-900 text-white`}>
            ⏹ 截止投票
          </button>
        )}
        {state.kind === "quiz" && state.phase === "question" && (
          <button onClick={() => act("reveal")} className={`${B} bg-emerald-600 text-white`}>
            ✅ 马上公布答案
          </button>
        )}
        {state.kind === "quiz" && state.phase === "reveal" && (
          <button onClick={() => act("leaderboard")} className={`${B} bg-gold text-ink`}>
            🏆 显示排行榜
          </button>
        )}
        {nextBtn}
        {state.kind !== "idle" && (
          <button onClick={() => act("idle")} className={`${B} bg-white text-slate-700 ring-1 ring-slate-200`}>
            ✕ 收起互动，回到直播
          </button>
        )}
        {state.kind === "idle" && !nextAct && acts[0] && (
          <button onClick={() => act("start", acts[0].id)} className={`${B} bg-brand text-white`}>
            ▶ 开始第一题：{acts[0].question.slice(0, 24)}
          </button>
        )}
        {state.kind !== "leaderboard" && (
          <button onClick={() => act("leaderboard")} className={`${B} bg-white text-slate-700 ring-1 ring-slate-200`}>
            🏆 显示排行榜
          </button>
        )}
      </div>

      <div className="pt-6 text-center">
        <button
          onClick={() => {
            if (!resetArm) {
              setResetArm(true);
              setTimeout(() => setResetArm(false), 4000);
              return;
            }
            setResetArm(false);
            act("reset");
          }}
          className="text-xs text-slate-400 underline"
        >
          {resetArm ? "再按一次确认：清空所有作答和分数" : "清空所有作答和分数（彩排后用）"}
        </button>
      </div>
    </div>
  );
}

function Bank({
  w,
  hostKey,
  acts,
  reload,
  act,
  goCtrl,
}: {
  w: WebinarConfig;
  hostKey: string;
  acts: Activity[];
  reload: () => Promise<void>;
  act: (a: string, id?: string) => Promise<void>;
  goCtrl: () => void;
}) {
  const empty = { type: "quiz" as "poll" | "quiz", question: "", options: ["", "", "", ""], correct_index: 0, duration_sec: 15 };
  const [f, setF] = useState<typeof empty & { id?: string; sort?: number }>(empty);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/host/activities", { ...f, slug: w.slug }, hostKey);
      setF(empty);
      setOpen(false);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function del(id: string) {
    await fetch(`/api/host/activities?id=${id}`, { method: "DELETE", headers: { "x-host-key": hostKey } });
    reload();
  }
  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";

  return (
    <div className="space-y-3">
      {!open && (
        <button onClick={() => setOpen(true)} className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 font-semibold text-slate-500">
          ＋ 新增题目
        </button>
      )}
      {open && (
        <form onSubmit={save} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            {(["quiz", "poll"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setF({ ...f, type: t, duration_sec: t === "quiz" ? 15 : 30 })}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold ${f.type === t ? "bg-brand text-white" : "bg-slate-100"}`}
              >
                {t === "quiz" ? "⚡ 抢答（有答案）" : "📊 投票（没答案）"}
              </button>
            ))}
          </div>
          <textarea
            required
            value={f.question}
            onChange={(e) => setF({ ...f, question: e.target.value })}
            placeholder="题目"
            rows={2}
            className={inp}
          />
          {f.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-white ${TILES[i].bg}`}>{TILES[i].shape}</span>
              <input
                value={o}
                onChange={(e) => setF({ ...f, options: f.options.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={`选项 ${i + 1}${i >= 2 ? "（可不填）" : ""}`}
                className={inp}
              />
              {f.type === "quiz" && (
                <label className="flex shrink-0 items-center gap-1 text-xs">
                  <input type="radio" checked={f.correct_index === i} onChange={() => setF({ ...f, correct_index: i })} />
                  正确
                </label>
              )}
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            时间（秒）
            <input
              type="number"
              min={5}
              max={120}
              value={f.duration_sec}
              onChange={(e) => setF({ ...f, duration_sec: Number(e.target.value) })}
              className={inp + " w-24"}
            />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setOpen(false); setF(empty); }} className="flex-1 rounded-lg bg-slate-100 py-2.5 font-semibold">
              取消
            </button>
            <button className="flex-1 rounded-lg bg-brand py-2.5 font-semibold text-white">保存</button>
          </div>
        </form>
      )}

      {acts.map((a, i) => (
        <div key={a.id} className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-xs text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <span className={`text-xs font-bold ${a.type === "quiz" ? "text-amber-600" : "text-brand"}`}>
                {a.type === "quiz" ? "⚡ 抢答" : "📊 投票"} · {a.duration_sec}s
              </span>
              <p className="font-semibold leading-snug">{a.question}</p>
              <p className="mt-1 text-xs text-slate-500">
                {a.options.map((o, j) => (
                  <span key={j} className={j === a.correct_index ? "font-bold text-emerald-600" : ""}>
                    {j > 0 && " / "}
                    {o}
                  </span>
                ))}
              </p>
            </div>
            <button
              onClick={async () => {
                await act("start", a.id);
                goCtrl();
              }}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white"
            >
              ▶ 开始
            </button>
          </div>
          <div className="mt-2 flex justify-end gap-3 text-xs text-slate-400">
            <button
              onClick={() => {
                setF({
                  id: a.id,
                  sort: a.sort,
                  type: a.type,
                  question: a.question,
                  options: [...a.options, "", "", ""].slice(0, 4),
                  correct_index: a.correct_index ?? 0,
                  duration_sec: a.duration_sec,
                });
                setOpen(true);
                window.scrollTo({ top: 0 });
              }}
            >
              编辑
            </button>
            <button onClick={() => del(a.id)} className="text-red-400">
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Regs({ w, hostKey }: { w: WebinarConfig; hostKey: string }) {
  const [d, setD] = useState<{ total: number; joined: number; rows: Registration[] } | null>(null);
  useEffect(() => {
    const load = () =>
      api<{ total: number; joined: number; rows: Registration[] }>(`/api/host/registrations?slug=${w.slug}`, undefined, hostKey).then(setD);
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [w.slug, hostKey]);
  if (!d) return <p className="text-slate-400">载入中…</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-3xl font-extrabold tabular-nums">{d.total}</div>
          <div className="text-sm text-slate-500">报名人数</div>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-3xl font-extrabold tabular-nums">{d.joined}</div>
          <div className="text-sm text-slate-500">
            进入教室 {d.total ? `（${Math.round((d.joined / d.total) * 100)}%）` : ""}
          </div>
        </div>
      </div>
      <a
        href={`/api/host/registrations?slug=${w.slug}&format=csv&key=${encodeURIComponent(hostKey)}`}
        className="block rounded-xl bg-slate-900 py-3 text-center font-semibold text-white"
      >
        ⬇ 下载 CSV（Excel 可开）
      </a>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">名字</th>
              <th className="px-3 py-2">WhatsApp</th>
              <th className="px-3 py-2">兴趣</th>
              <th className="px-3 py-2">出席</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.email}</div>
                </td>
                <td className="px-3 py-2 tabular-nums">+{r.phone}</td>
                <td className="px-3 py-2 text-xs">{r.interest ?? "-"}</td>
                <td className="px-3 py-2">{r.joined_at ? "✅" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function useSales(w: WebinarConfig, hostKey: string, everyMs = 8000) {
  const [d, setD] = useState<{ paidCount: number; revenue: number; pendingCount: number; orders: (Order & { session_label: string })[] } | null>(null);
  const load = useCallback(
    () =>
      api<{ paidCount: number; revenue: number; pendingCount: number; orders: (Order & { session_label: string })[] }>(
        `/api/host/orders?slug=${w.slug}`,
        undefined,
        hostKey
      )
        .then(setD)
        .catch(() => {}),
    [w.slug, hostKey]
  );
  useEffect(() => {
    load();
    const t = setInterval(load, everyMs);
    return () => clearInterval(t);
  }, [load, everyMs]);
  return { d, load };
}

function OfferToggle({
  w,
  hostKey,
  offer,
  toggleOffer,
}: {
  w: WebinarConfig;
  hostKey: string;
  offer: { open: boolean; v: number };
  toggleOffer: (open: boolean) => Promise<void>;
}) {
  const { d } = useSales(w, hostKey, 5000);
  const [busy, setBusy] = useState(false);
  const click = async () => {
    setBusy(true);
    await toggleOffer(!offer.open).finally(() => setBusy(false));
  };
  return offer.open ? (
    <div className="rounded-2xl bg-gradient-to-r from-amber-400 to-gold p-4 text-ink shadow-sm">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">🎓 报名弹窗开放中 · 所有学员都看到了</p>
          <p className="mt-0.5 text-xs opacity-80">
            已付款 <b className="text-base tabular-nums">{d?.paidCount ?? 0}</b> 人 · {money(d?.revenue ?? 0)}
            {d?.pendingCount ? ` · ${d.pendingCount} 人正在付款` : ""}
          </p>
        </div>
        <button disabled={busy} onClick={click} className="shrink-0 rounded-xl bg-ink px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
          关闭弹窗
        </button>
      </div>
    </div>
  ) : (
    <button
      disabled={busy}
      onClick={click}
      className="w-full rounded-2xl bg-gold px-4 py-4 text-lg font-extrabold text-ink shadow-sm transition active:scale-[0.98] disabled:opacity-50"
    >
      🎓 开放正式课程报名（全部学员弹出）
    </button>
  );
}

function Sales({
  w,
  hostKey,
  offer,
  toggleOffer,
}: {
  w: WebinarConfig;
  hostKey: string;
  offer: { open: boolean; v: number };
  toggleOffer: (open: boolean) => Promise<void>;
}) {
  const { d, load } = useSales(w, hostKey);
  const [sessions, setSessions] = useState<SessionAvail[]>([]);
  const empty = { label: "", starts_at: "", location: "", capacity: 20 };
  const [f, setF] = useState<typeof empty & { id?: string; active?: boolean }>(empty);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");

  const loadSessions = useCallback(
    () => api<{ sessions: SessionAvail[] }>(`/api/host/sessions?slug=${w.slug}`, undefined, hostKey).then((r) => setSessions(r.sessions)),
    [w.slug, hostKey]
  );
  useEffect(() => {
    loadSessions();
    const t = setInterval(loadSessions, 10000);
    return () => clearInterval(t);
  }, [loadSessions]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      // datetime-local 没有时区 → 当作马来西亚时间
      const iso = f.starts_at.length === 16 ? `${f.starts_at}:00+08:00` : f.starts_at;
      await api("/api/host/sessions", { ...f, starts_at: iso, slug: w.slug }, hostKey);
      setF(empty);
      setOpen(false);
      loadSessions();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function del(id: string) {
    await fetch(`/api/host/sessions?id=${id}`, { method: "DELETE", headers: { "x-host-key": hostKey } });
    loadSessions();
  }
  const toLocal = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 8 * 3600000);
    return d.toISOString().slice(0, 16);
  };
  const inp = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand";
  const badge: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-slate-100 text-slate-500",
    expired: "bg-slate-100 text-slate-500",
  };
  const label: Record<string, string> = { paid: "已付款", pending: "付款中", cancelled: "已取消", expired: "已过期" };

  return (
    <div className="space-y-4">
      <OfferToggle w={w} hostKey={hostKey} offer={offer} toggleOffer={toggleOffer} />

      <div className="grid grid-cols-3 gap-2">
        {[
          [String(d?.paidCount ?? 0), "已付款"],
          [money(d?.revenue ?? 0), "收入"],
          [String(d?.pendingCount ?? 0), "付款中"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="truncate text-xl font-extrabold tabular-nums">{v}</div>
            <div className="text-xs text-slate-500">{l}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center">
          <h3 className="flex-1 font-bold">📅 开课日期与名额</h3>
          {!open && (
            <button onClick={() => setOpen(true)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
              ＋ 新增
            </button>
          )}
        </div>
        {open && (
          <form onSubmit={save} className="mb-4 space-y-2 rounded-xl bg-slate-50 p-3">
            <input required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="名称，例如：第 1 期 · 12月20–21日" className={inp} />
            <label className="block text-xs text-slate-500">
              开课时间（马来西亚时间）
              <input required type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} className={inp + " mt-1"} />
            </label>
            <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="地点（例如：Subang Jaya 培训中心 / 线上）" className={inp} />
            <label className="flex items-center gap-2 text-sm">
              名额
              <input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} className={inp + " w-24"} />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setOpen(false); setF(empty); }} className="flex-1 rounded-lg bg-white py-2 font-semibold ring-1 ring-slate-200">
                取消
              </button>
              <button className="flex-1 rounded-lg bg-brand py-2 font-semibold text-white">保存</button>
            </div>
          </form>
        )}
        {sessions.length === 0 && !open && <p className="text-sm text-slate-500">还没有开课日期，学员报名页会显示「日期还没公布」。</p>}
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className={`rounded-xl border border-slate-100 p-3 ${s.active ? "" : "opacity-50"}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {s.label} {!s.active && <span className="text-xs text-slate-400">（已关闭）</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(s.starts_at).date} {fmtDate(s.starts_at).time.split("（")[0]} {s.location && `· ${s.location}`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-extrabold tabular-nums">
                    {s.paid}/{s.capacity}
                  </div>
                  <div className="text-[11px] text-slate-400">已付 / 名额</div>
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (s.paid / s.capacity) * 100)}%` }} />
              </div>
              <div className="mt-2 flex justify-end gap-3 text-xs text-slate-400">
                <button
                  onClick={() => {
                    setF({ id: s.id, label: s.label, starts_at: toLocal(s.starts_at), location: s.location, capacity: s.capacity, active: s.active });
                    setOpen(true);
                  }}
                >
                  编辑
                </button>
                {s.active ? (
                  <button onClick={() => del(s.id)} className="text-red-400">
                    {s.taken > 0 ? "关闭报名" : "删除"}
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await api("/api/host/sessions", { ...s, slug: w.slug, active: true }, hostKey);
                      loadSessions();
                    }}
                  >
                    重新开放
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="flex-1 font-bold">🧾 订单</h3>
          <button onClick={load} className="text-xs text-slate-400">刷新</button>
          <a
            href={`/api/host/orders?slug=${w.slug}&format=csv&key=${encodeURIComponent(hostKey)}`}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
          >
            ⬇ CSV
          </a>
        </div>
        {!d?.orders.length && <p className="text-sm text-slate-500">还没有订单</p>}
        <div className="divide-y divide-slate-100">
          {d?.orders.map((o) => (
            <div key={o.id} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {o.name} <span className="font-mono text-xs text-slate-400">{o.code}</span>
                </p>
                <p className="truncate text-xs text-slate-500">
                  +{o.phone} · {o.session_label}
                </p>
              </div>
              <span className="tabular-nums">{money(o.amount, o.currency)}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badge[o.status]}`}>{label[o.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
