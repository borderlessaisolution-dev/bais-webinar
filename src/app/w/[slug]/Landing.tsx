"use client";

import { useEffect, useMemo, useState } from "react";
import type { WebinarConfig } from "@/lib/config";
import { api, fmtDate, savePass } from "@/lib/client";

function useCountdown(iso: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, done: ms === 0 };
}

function fullPhone(country: string, raw: string) {
  const d = raw.replace(/\D/g, "");
  const cc = country === "SG" ? "65" : "60";
  if (d.startsWith(cc)) return d;
  return cc + d.replace(/^0+/, "");
}

function gcalLink(w: WebinarConfig, liveUrl: string) {
  const start = new Date(w.startAt);
  const end = new Date(start.getTime() + w.durationMin * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${w.brand} · ${w.title}`,
    dates: `${f(start)}/${f(end)}`,
    details: `入场链接：${liveUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export default function Landing({ w }: { w: WebinarConfig }) {
  const cd = useCountdown(w.startAt);
  const when = useMemo(() => fmtDate(w.startAt), [w.startAt]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", country: "MY", interest: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string } | null>(null);
  const [liveUrl, setLiveUrl] = useState(`/live/${w.slug}`);

  useEffect(() => setLiveUrl(`${location.origin}/live/${w.slug}`), [w.slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const q = new URLSearchParams(location.search);
      const r = await api<{ pass: string; name: string }>("/api/register", {
        slug: w.slug,
        ...form,
        phone: fullPhone(form.country, form.phone),
        utm_source: q.get("utm_source") ?? q.get("src"),
        utm_campaign: q.get("utm_campaign"),
      });
      savePass(w.slug, r.pass, r.name);
      setDone({ name: r.name });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const vars = {
    "--p": w.theme.primary,
    "--pd": w.theme.primaryDark,
    "--a": w.theme.accent,
  } as React.CSSProperties;

  if (done) {
    return (
      <main style={vars} className="min-h-dvh bg-[var(--pd)] text-white flex items-center justify-center p-5">
        <div className="w-full max-w-md pop-in">
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-400 text-3xl text-[var(--pd)]">
              ✓
            </div>
            <h1 className="text-2xl font-bold">报名成功，{done.name}！</h1>
            <p className="mt-2 text-white/75">
              {when.date}
              <br />
              {when.time}
            </p>
          </div>

          <div className="mt-7 rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--p)]">下一步 · 很重要</p>
            <h2 className="mt-1 text-lg font-bold">加入 WhatsApp Community</h2>
            <p className="mt-1 text-sm text-slate-600">入场链接和上课提醒都会发在 Community 里，没加入会收不到。</p>
            <a
              href={w.communityLink}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3.5 text-base font-bold text-white active:scale-[0.98]"
            >
              <span>💬</span> 加入 WhatsApp Community
            </a>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <a
              href={gcalLink(w, liveUrl)}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/20 bg-white/10 py-3 text-center font-medium"
            >
              📅 加到日历
            </a>
            <a href={`/live/${w.slug}`} className="rounded-xl border border-white/20 bg-white/10 py-3 text-center font-medium">
              🎥 直播教室
            </a>
          </div>
          <p className="mt-6 text-center text-xs text-white/50">Powered by BAIS Webinar · Borderless AI Solution</p>
        </div>
      </main>
    );
  }

  return (
    <main style={vars} className="min-h-dvh pb-24 md:pb-0">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[var(--pd)] text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 50% at 85% 10%, color-mix(in srgb, var(--p) 80%, transparent), transparent 70%), radial-gradient(40% 40% at 0% 100%, color-mix(in srgb, var(--a) 35%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-5 pb-10 pt-8 md:grid md:grid-cols-[1.2fr_1fr] md:gap-10 md:pb-16 md:pt-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--a)]" />
              {w.brand} · 线上直播
            </div>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.15] md:text-5xl">{w.title}</h1>
            <p className="mt-3 text-base leading-relaxed text-white/80 md:text-lg">{w.subtitle}</p>

            <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🗓️</div>
                <div className="text-sm leading-6">
                  <div className="font-semibold">{when.date}</div>
                  <div className="text-white/75">
                    {when.time} · {w.durationMin} 分钟
                  </div>
                </div>
                <div className="ml-auto rounded-lg bg-[var(--a)] px-2.5 py-1 text-xs font-bold text-[var(--pd)]">
                  {w.priceLabel}
                </div>
              </div>
              {cd && !cd.done && (
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[
                    [cd.d, "天"],
                    [cd.h, "时"],
                    [cd.m, "分"],
                    [cd.s, "秒"],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-xl bg-[var(--pd)]/60 py-2">
                      <div className="text-2xl font-bold tabular-nums">{String(v).padStart(2, "0")}</div>
                      <div className="text-[11px] text-white/60">{l}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <a
              href="#register"
              className="mt-5 hidden rounded-xl bg-[var(--a)] px-6 py-3.5 text-center font-bold text-[var(--pd)] md:inline-block"
            >
              立即免费报名 →
            </a>
          </div>

          {/* 桌面版右边直接放表格 */}
          <div className="hidden md:block">
            <RegForm w={w} form={form} setForm={setForm} submit={submit} busy={busy} err={err} />
          </div>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-5xl px-5 py-10">
        <h2 className="text-xl font-bold md:text-2xl">这堂课你会得到</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {w.highlights.map((h) => (
            <div key={h.title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <div className="text-2xl">{h.icon}</div>
              <div className="mt-2 font-semibold">{h.title}</div>
              <div className="mt-1 text-sm leading-relaxed text-slate-500">{h.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Agenda */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <h2 className="text-xl font-bold md:text-2xl">{w.durationMin} 分钟课程流程</h2>
          <ol className="mt-5 space-y-0">
            {w.agenda.map((a, i) => (
              <li key={a.time} className="relative flex gap-4 pb-5 last:pb-0">
                {i < w.agenda.length - 1 && <span className="absolute left-[27px] top-8 h-full w-px bg-slate-200" />}
                <span className="relative z-10 w-14 shrink-0 rounded-lg bg-[var(--p)]/10 py-1 text-center text-xs font-bold text-[var(--p)]">
                  {a.time}
                </span>
                <span className="pt-0.5 text-[15px]">{a.text}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Speakers + audience */}
      <section className="mx-auto grid max-w-5xl gap-8 px-5 py-10 md:grid-cols-2">
        <div>
          <h2 className="text-xl font-bold">讲师</h2>
          <div className="mt-4 space-y-3">
            {w.speakers.map((s) => (
              <div key={s.name} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--pd)] font-bold text-white">
                  {s.initials}
                </div>
                <div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-sm text-slate-500">{s.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold">适合谁参加</h2>
          <ul className="mt-4 space-y-2">
            {w.audience.map((a) => (
              <li key={a} className="flex items-center gap-2 text-[15px]">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-xs text-emerald-700">✓</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Mobile form */}
      <section id="register" className="mx-auto max-w-md scroll-mt-4 px-5 pb-12 md:hidden">
        <RegForm w={w} form={form} setForm={setForm} submit={submit} busy={busy} err={err} />
      </section>

      <footer className="pb-8 text-center text-xs text-slate-400">Powered by BAIS Webinar · Borderless AI Solution</footer>

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
        <a href="#register" className="block rounded-xl bg-[var(--p)] py-3.5 text-center font-bold text-white">
          立即免费报名 · 名额有限
        </a>
      </div>
    </main>
  );
}

type FormState = { name: string; email: string; phone: string; country: string; interest: string };

function RegForm({
  w,
  form,
  setForm,
  submit,
  busy,
  err,
}: {
  w: WebinarConfig;
  form: FormState;
  setForm: (f: FormState) => void;
  submit: (e: React.FormEvent) => void;
  busy: boolean;
  err: string;
}) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const field =
    "rounded-xl border border-slate-200 bg-slate-50 py-3 text-base text-slate-900 outline-none focus:border-[var(--p)] focus:bg-white focus:ring-2 focus:ring-[var(--p)]/20";
  const input =
    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-base text-slate-900 outline-none focus:border-[var(--p)] focus:bg-white focus:ring-2 focus:ring-[var(--p)]/20";
  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-5 text-slate-900 shadow-xl ring-1 ring-slate-100">
      <h2 className="text-lg font-bold">免费报名</h2>
      <p className="text-sm text-slate-500">填好资料，入场链接会发到 WhatsApp Community。</p>
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">
          名字
          <input required value={form.name} onChange={set("name")} placeholder="你的名字" className={input} autoComplete="name" />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input
            required
            type="email"
            value={form.email}
            onChange={set("email")}
            placeholder="you@email.com"
            className={input}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium">
          WhatsApp 号码
          <div className="mt-1 flex gap-2">
            <select value={form.country} onChange={set("country")} className={field + " w-[96px] shrink-0 px-2"}>
              <option value="MY">🇲🇾 +60</option>
              <option value="SG">🇸🇬 +65</option>
            </select>
            <input
              required
              inputMode="tel"
              value={form.phone}
              onChange={set("phone")}
              placeholder={form.country === "SG" ? "8123 4567" : "012-345 6789"}
              className={field + " min-w-0 flex-1 px-3.5"}
              autoComplete="tel"
            />
          </div>
        </label>
        <label className="block text-sm font-medium">
          最想了解什么？
          <select value={form.interest} onChange={set("interest")} className={input}>
            <option value="">请选择（可不填）</option>
            {w.interests.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
      </div>
      {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}
      <button
        disabled={busy}
        className="mt-5 w-full rounded-xl bg-[var(--p)] py-3.5 text-base font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "提交中…" : "确认报名"}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">资料只用于这堂课的通知，不会外泄。</p>
    </form>
  );
}
