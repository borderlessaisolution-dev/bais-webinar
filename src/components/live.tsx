"use client";

import { useEffect, useRef, useState } from "react";
import { isTrackReference, useTracks, VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import type { ChatMsg, LeaderRow, LiveState } from "@/lib/types";

/* ---------------- Kahoot 风格的四色选项 ---------------- */
export const TILES = [
  { bg: "bg-k-red", shape: "▲" },
  { bg: "bg-k-blue", shape: "◆" },
  { bg: "bg-k-yellow", shape: "●" },
  { bg: "bg-k-green", shape: "■" },
];

export const EMOJIS = ["👍", "❤️", "😂", "👏", "🔥", "😮"];

/* ---------------- 老师画面（摄像头 / 分享屏幕） ---------------- */
export function Stage({ waitingText = "等待老师开播…", compact }: { waitingText?: string; compact?: boolean }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  ).filter(isTrackReference).filter((t) => t.participant.identity === "host" && !t.publication.isMuted);

  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const cam = tracks.find((t) => t.source === Track.Source.Camera);
  const main = screen ?? cam;

  return (
    <div
      className={`relative w-full overflow-hidden bg-black transition-all ${compact ? "h-[24vh] md:aspect-video md:h-auto" : "aspect-video"}`}
    >
      {main ? (
        <VideoTrack trackRef={main} className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full w-full place-items-center text-white/70">
          <div className="text-center">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <p className="text-sm">{waitingText}</p>
          </div>
        </div>
      )}
      {screen && cam && (
        <div className="absolute bottom-2 right-2 w-[28%] overflow-hidden rounded-lg ring-2 ring-white/40">
          <VideoTrack trackRef={cam} className="aspect-video w-full object-cover" />
        </div>
      )}
    </div>
  );
}

/* ---------------- 飘起来的表情 ---------------- */
type Floater = { id: number; emoji: string; left: number };
export function useFloaters() {
  const [items, setItems] = useState<Floater[]>([]);
  const idRef = useRef(0);
  const add = (emoji: string) => {
    setItems((cur) => {
      if (cur.length > 30) return cur; // 一千人一起按也不会卡
      const id = ++idRef.current;
      setTimeout(() => setItems((c) => c.filter((f) => f.id !== id)), 2700);
      return [...cur, { id, emoji, left: 8 + Math.random() * 84 }];
    });
  };
  return { items, add };
}
export function FloaterLayer({ items }: { items: Floater[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((f) => (
        <span key={f.id} className="emoji-float absolute bottom-2 text-3xl" style={{ left: `${f.left}%` }}>
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

/* ---------------- 聊天 ---------------- */
export function ChatList({ msgs, compact }: { msgs: ChatMsg[]; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // 只有本来就在底部时才自动滚
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);
  return (
    <div ref={box} className={`overflow-y-auto px-3 ${compact ? "py-1" : "py-2"} space-y-1.5`}>
      {msgs.length === 0 && <p className="py-6 text-center text-sm text-slate-400">还没有留言，打个招呼吧 👋</p>}
      {msgs.map((m) => (
        <div key={m.id} className="text-[14px] leading-snug">
          <span className={`mr-1.5 font-semibold ${m.host ? "text-amber-600" : "text-slate-500"}`}>
            {m.host ? "👩‍🏫 " : ""}
            {m.name}
          </span>
          <span className={m.host ? "font-medium text-slate-900" : "text-slate-800"}>{m.text}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

export function ChatInput({
  onSend,
  onEmoji,
  disabled,
}: {
  onSend: (text: string) => void;
  onEmoji: (e: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const last = useRef(0);
  const [cool, setCool] = useState(false);
  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (Date.now() - last.current < 2500) {
      setCool(true);
      setTimeout(() => setCool(false), 1200);
      return;
    }
    last.current = Date.now();
    onSend(t.slice(0, 200));
    setText("");
  }
  const lastEmoji = useRef(0);
  return (
    <div className="border-t border-slate-200 bg-white px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
      <div className="mb-2 flex justify-between px-1">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              if (Date.now() - lastEmoji.current < 350) return;
              lastEmoji.current = Date.now();
              onEmoji(e);
            }}
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl transition active:scale-125"
          >
            {e}
          </button>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          maxLength={200}
          placeholder={cool ? "慢一点，2 秒后再发 🙂" : "说点什么…"}
          className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button className="rounded-full bg-brand px-4 font-semibold text-white disabled:opacity-50" disabled={disabled}>
          发送
        </button>
      </form>
    </div>
  );
}

/* ---------------- 倒计时 ---------------- */
export function useRemaining(state: LiveState, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  if (state.kind !== "quiz" && state.kind !== "poll") return 0;
  const end = state.startedAt + state.activity.duration_sec * 1000;
  return Math.max(0, end - (now + offset));
}

export function TimerRing({ ms, total }: { ms: number; total: number }) {
  const s = Math.ceil(ms / 1000);
  const pct = total > 0 ? ms / total : 0;
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke={s <= 5 ? "#e21b3c" : "#4f46e5"}
          strokeWidth="5"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .2s linear" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-extrabold tabular-nums">{s}</span>
    </div>
  );
}

/* ---------------- 结果条 ---------------- */
export function ResultBars({
  options,
  counts,
  correctIndex,
  mine,
  kahoot,
}: {
  options: string[];
  counts: number[];
  correctIndex?: number | null;
  mine?: number | null;
  kahoot?: boolean;
}) {
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-2">
      {options.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        const right = correctIndex === i;
        const faded = correctIndex != null && !right;
        return (
          <div key={i} className={`relative overflow-hidden rounded-xl bg-slate-100 ${faded ? "opacity-50" : ""}`}>
            <div
              className={`absolute inset-y-0 left-0 ${kahoot ? TILES[i].bg : "bg-brand/20"} ${kahoot ? "opacity-90" : ""}`}
              style={{ width: `${pct}%`, transition: "width .6s ease" }}
            />
            <div className={`relative flex items-center gap-2 px-3 py-2.5 text-[15px] ${kahoot && pct > 55 ? "text-white" : ""}`}>
              {kahoot && <span className="w-4 text-center">{TILES[i].shape}</span>}
              <span className="flex-1 font-medium">
                {o} {mine === i && <span className="ml-1 text-xs opacity-70">（我）</span>}
              </span>
              {right && <span className="rounded bg-emerald-500 px-1.5 text-xs font-bold text-white">✓ 正确</span>}
              <span className="tabular-nums font-semibold">{pct}%</span>
              <span className="w-10 text-right text-xs tabular-nums opacity-60">{counts[i]}</span>
            </div>
          </div>
        );
      })}
      <p className="text-right text-xs text-slate-400">{total} 人作答</p>
    </div>
  );
}

/* ---------------- 排行榜 ---------------- */
export function Leaderboard({ top, meId }: { top: LeaderRow[]; meId?: string }) {
  if (top.length === 0) return <p className="py-6 text-center text-slate-500">还没有人得分</p>;
  const podium = [top[1], top[0], top[2]];
  const h = ["h-16", "h-24", "h-12"];
  const medal = ["🥈", "🥇", "🥉"];
  return (
    <div>
      <div className="flex items-end justify-center gap-2">
        {podium.map((p, i) =>
          p ? (
            <div key={p.id} className="flex w-1/3 flex-col items-center">
              <span className="text-2xl">{medal[i]}</span>
              <span className={`max-w-full truncate text-sm font-bold ${p.id === meId ? "text-brand" : ""}`}>{p.name}</span>
              <span className="text-xs tabular-nums text-slate-500">{p.score}</span>
              <div className={`mt-1 w-full rounded-t-lg ${h[i]} ${i === 1 ? "bg-gold" : "bg-slate-300"}`} />
            </div>
          ) : (
            <div key={i} className="w-1/3" />
          )
        )}
      </div>
      <ol className="mt-3 space-y-1">
        {top.slice(3).map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center rounded-lg px-3 py-1.5 text-sm ${p.id === meId ? "bg-brand/10 font-semibold" : "bg-slate-50"}`}
          >
            <span className="w-6 text-slate-400">{i + 4}</span>
            <span className="flex-1 truncate">{p.name}</span>
            <span className="tabular-nums">{p.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
