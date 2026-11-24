"use client";

import { useEffect, useState } from "react";
import type { WebinarConfig } from "@/lib/config";
import { api, fmtDate, gcalUrl, money } from "@/lib/client";

type O = {
  code: string;
  status: "pending" | "paid" | "cancelled" | "expired";
  name: string;
  email: string;
  amount: number;
  currency: string;
  course: string;
  session: { label: string; starts_at: string; location: string } | null;
};

export default function Done({ w }: { w: WebinarConfig }) {
  const [o, setO] = useState<O | null>(null);
  const [err, setErr] = useState("");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const id = q.get("order");
    const k = q.get("k");
    if (!id || !k) {
      setErr("链接不完整");
      return;
    }
    let stop = false;
    const t0 = Date.now();
    const tick = async () => {
      try {
        const r = await api<O>(`/api/order?id=${id}&k=${encodeURIComponent(k)}`);
        if (stop) return;
        setO(r);
        if (r.status === "pending") {
          if (Date.now() - t0 > 45000) setSlow(true);
          setTimeout(tick, Date.now() - t0 > 120000 ? 10000 : 2500);
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    };
    tick();
    return () => {
      stop = true;
    };
  }, []);

  const card = "w-full max-w-md rounded-3xl bg-white p-6 text-slate-900 shadow-xl";

  return (
    <main className="grid min-h-dvh place-items-center bg-ink p-5">
      {err && <div className={card}>{err}</div>}
      {!err && !o && <p className="text-white/70">载入中…</p>}

      {o?.status === "pending" && (
        <div className={card + " text-center"}>
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand" />
          <h1 className="text-xl font-bold">正在确认付款…</h1>
          <p className="mt-2 text-sm text-slate-500">FPX 网银付款可能要几十秒，请不要关闭这一页。</p>
          {slow && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              还在等银行确认。如果你已经扣款，请截图这一页（订单号 {o.code}）WhatsApp 给我们，我们会人工确认。
            </p>
          )}
        </div>
      )}

      {(o?.status === "cancelled" || o?.status === "expired") && (
        <div className={card + " text-center"}>
          <div className="text-4xl">⚠️</div>
          <h1 className="mt-2 text-xl font-bold">付款没有完成</h1>
          <p className="mt-2 text-sm text-slate-500">刚才保留的名额已经释放。你可以重新选择日期再付款一次。</p>
          <a href={`/checkout/${w.slug}`} className="mt-5 block rounded-xl bg-brand py-3.5 font-bold text-white">
            重新报名
          </a>
        </div>
      )}

      {o?.status === "paid" && (
        <div className={card + " pop-in"}>
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-3xl text-white">✓</div>
            <h1 className="mt-3 text-2xl font-extrabold">报名成功！</h1>
            <p className="mt-1 text-slate-500">{o.name}，你的位子已经锁定 🎉</p>
          </div>
          <dl className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
            <Row k="订单号" v={<span className="font-mono font-bold">{o.code}</span>} />
            <Row k="课程" v={o.course} />
            {o.session && (
              <>
                <Row k="日期" v={`${o.session.label}`} />
                <Row k="时间" v={`${fmtDate(o.session.starts_at).date} ${fmtDate(o.session.starts_at).time.split("（")[0]}`} />
                {o.session.location && <Row k="地点" v={o.session.location} />}
              </>
            )}
            <Row k="已付" v={<b>{money(o.amount, o.currency)}</b>} />
          </dl>
          <p className="mt-3 text-center text-xs text-slate-500">收据已发到 {o.email} · 建议截图保存这一页</p>
          {o.session && (
            <a
              target="_blank"
              rel="noreferrer"
              href={gcalUrl(o.course, o.session.starts_at, 8 * 60, `订单号 ${o.code}`, o.session.location)}
              className="mt-5 block rounded-xl bg-brand py-3.5 text-center font-bold text-white"
            >
              📅 加到日历
            </a>
          )}
          <a href={w.communityLink} className="mt-2 block rounded-xl bg-[#25D366] py-3.5 text-center font-bold text-white">
            💬 有问题？WhatsApp 我们
          </a>
        </div>
      )}
    </main>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-slate-400">{k}</dt>
      <dd className="min-w-0 flex-1 font-medium">{v}</dd>
    </div>
  );
}
