"use client";

import { useEffect, useState } from "react";
import { api, money } from "@/lib/client";

/** 还没接 Stripe 时用的假付款页：不会真的扣钱 */
export default function MockPay() {
  const [q, setQ] = useState<{ id: string; k: string; slug: string } | null>(null);
  const [o, setO] = useState<{ code: string; amount: number; currency: string; course: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const id = p.get("order") ?? "";
    const k = p.get("k") ?? "";
    setQ({ id, k, slug: p.get("slug") ?? "lansidai" });
    api<{ code: string; amount: number; currency: string; course: string }>(`/api/order?id=${id}&k=${encodeURIComponent(k)}`)
      .then(setO)
      .catch((e) => setErr(e.message));
  }, []);

  async function go(result: "paid" | "cancel") {
    if (!q) return;
    setBusy(true);
    try {
      await api("/api/pay/mock", { id: q.id, k: q.k, result });
      const back = encodeURIComponent(q.slug);
      location.href =
        result === "paid"
          ? `/checkout/${back}/done?order=${q.id}&k=${encodeURIComponent(q.k)}`
          : `/checkout/${back}?cancelled=${q.id}&k=${encodeURIComponent(q.k)}`;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-200 p-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-center text-xs font-bold text-amber-800">
          🧪 测试付款页 · 不会真的扣钱（正式上线会换成 Stripe）
        </p>
        {err && <p className="mt-4 text-sm text-red-600">{err}</p>}
        {o && (
          <>
            <p className="mt-5 text-sm text-slate-500">{o.course}</p>
            <p className="text-3xl font-extrabold">{money(o.amount, o.currency)}</p>
            <p className="mt-1 font-mono text-xs text-slate-400">{o.code}</p>
            <button
              disabled={busy}
              onClick={() => go("paid")}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-3.5 font-bold text-white disabled:opacity-50"
            >
              ✅ 模拟付款成功
            </button>
            <button
              disabled={busy}
              onClick={() => go("cancel")}
              className="mt-2 w-full rounded-xl bg-slate-100 py-3.5 font-semibold text-slate-600 disabled:opacity-50"
            >
              ← 取消，回去报名页
            </button>
          </>
        )}
      </div>
    </main>
  );
}
