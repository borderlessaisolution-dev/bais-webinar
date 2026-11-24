"use client";

import { useEffect, useState } from "react";
import type { WebinarConfig } from "@/lib/config";
import { api, fmtDate, loadPass, money } from "@/lib/client";

type S = { id: string; label: string; starts_at: string; location: string; capacity: number; seats_left: number };

function splitPhone(full: string) {
  if (full.startsWith("65")) return { country: "SG", phone: full.slice(2) };
  if (full.startsWith("60")) return { country: "MY", phone: "0" + full.slice(2) };
  return { country: "MY", phone: full };
}
function fullPhone(country: string, raw: string) {
  const d = raw.replace(/\D/g, "");
  const cc = country === "SG" ? "65" : "60";
  return d.startsWith(cc) ? d : cc + d.replace(/^0+/, "");
}

export default function Checkout({ w }: { w: WebinarConfig }) {
  const o = w.offer;
  const [sessions, setSessions] = useState<S[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", country: "MY" });
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pass, setPass] = useState<string | undefined>();
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    setSource(q.get("src"));
    // 从付款页按返回 → 释放名额
    const cancelled = q.get("cancelled");
    if (cancelled) {
      api("/api/order/cancel", { id: cancelled, k: q.get("k") }).catch(() => {});
      setNotice("付款没有完成，刚才保留的名额已释放。你可以重新选择日期。");
      history.replaceState(null, "", location.pathname);
    }
    const p = loadPass(w.slug);
    if (p) {
      setPass(p.pass);
      api<{ name: string; email: string; phone: string }>(`/api/me?pass=${encodeURIComponent(p.pass)}`)
        .then((m) => setForm({ name: m.name, email: m.email, ...splitPhone(m.phone) }))
        .catch(() => {});
    }
    const load = () =>
      api<{ sessions: S[] }>(`/api/sessions?slug=${w.slug}`).then((r) => {
        setSessions(r.sessions);
        setSel((cur) => cur || r.sessions.find((s) => s.seats_left > 0)?.id || "");
      });
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [w.slug]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!sel) return setErr("请先选上课日期");
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/checkout", {
        slug: w.slug,
        sessionId: sel,
        name: form.name,
        email: form.email,
        phone: fullPhone(form.country, form.phone),
        pass,
        source,
      });
      location.href = r.url;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
      api<{ sessions: S[] }>(`/api/sessions?slug=${w.slug}`).then((r) => setSessions(r.sessions)).catch(() => {});
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const field =
    "rounded-xl border border-slate-200 bg-slate-50 py-3 text-base text-slate-900 outline-none focus:border-brand focus:bg-white focus:ring-2 focus:ring-brand/20";
  const selected = sessions?.find((s) => s.id === sel);

  return (
    <main className="min-h-dvh pb-28">
      <section className="bg-ink px-5 pb-8 pt-6 text-white">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold text-white/60">{w.brand}</p>
          {o.badge && (
            <span className="mt-3 inline-block rounded-full bg-gold px-3 py-1 text-xs font-bold text-ink">🎓 {o.badge}</span>
          )}
          <h1 className="mt-3 text-2xl font-extrabold leading-tight">{o.title}</h1>
          <p className="mt-2 text-white/75">{o.subtitle}</p>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-4xl font-extrabold">{money(o.priceCents, o.currency)}</span>
            {o.compareAtCents && (
              <span className="pb-1 text-lg text-white/50 line-through">{money(o.compareAtCents, o.currency)}</span>
            )}
          </div>
          <ul className="mt-5 space-y-2">
            {o.bullets.map((b) => (
              <li key={b} className="flex gap-2 text-[15px]">
                <span className="text-emerald-400">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <form onSubmit={pay} className="mx-auto max-w-xl space-y-6 px-5 pt-6">
        {notice && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>}

        <div>
          <h2 className="text-lg font-bold">① 选择上课日期</h2>
          <div className="mt-3 space-y-2.5">
            {sessions === null && <p className="text-slate-400">载入中…</p>}
            {sessions?.length === 0 && (
              <p className="rounded-xl bg-slate-100 px-4 py-4 text-sm text-slate-500">开课日期还没公布，请稍后再来或联系我们。</p>
            )}
            {sessions?.map((s) => {
              const full = s.seats_left <= 0;
              const when = fmtDate(s.starts_at);
              const on = sel === s.id;
              return (
                <button
                  type="button"
                  key={s.id}
                  disabled={full}
                  onClick={() => setSel(s.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-4 text-left transition ${
                    on ? "border-brand ring-4 ring-brand/10" : "border-slate-200"
                  } ${full ? "opacity-50" : "active:scale-[0.99]"}`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                      on ? "border-brand bg-brand text-white" : "border-slate-300"
                    }`}
                  >
                    {on && <span className="text-xs">✓</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{s.label}</span>
                    <span className="block text-sm text-slate-500">
                      {when.date} · {when.time.split("（")[0]}
                    </span>
                    {s.location && <span className="block text-sm text-slate-500">📍 {s.location}</span>}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                      full ? "bg-slate-200 text-slate-500" : s.seats_left <= 5 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {full ? "已满" : s.seats_left <= 5 ? `仅剩 ${s.seats_left} 位` : `剩 ${s.seats_left} 位`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold">② 填写资料</h2>
          <div className="mt-3 space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
            <label className="block text-sm font-medium">
              名字（证书上的名字）
              <input required value={form.name} onChange={set("name")} className={field + " mt-1 w-full px-3.5"} autoComplete="name" />
            </label>
            <label className="block text-sm font-medium">
              Email（收据会发到这里）
              <input
                required
                type="email"
                value={form.email}
                onChange={set("email")}
                className={field + " mt-1 w-full px-3.5"}
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
                  className={field + " min-w-0 flex-1 px-3.5"}
                  autoComplete="tel"
                />
              </div>
            </label>
          </div>
        </div>

        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
        {o.note && <p className="text-center text-xs text-slate-400">{o.note}</p>}

        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-5 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xl font-extrabold">{money(o.priceCents, o.currency)}</div>
              <div className="truncate text-xs text-slate-500">{selected ? selected.label : "请选择日期"}</div>
            </div>
            <button
              disabled={busy || !sel}
              className="rounded-xl bg-brand px-6 py-3.5 font-bold text-white transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "处理中…" : "确认并付款 →"}
            </button>
          </div>
        </div>
        <p className="pb-4 text-center text-xs text-slate-400">🔒 安全付款 · FPX 网银 / 信用卡 / GrabPay</p>
      </form>
    </main>
  );
}
