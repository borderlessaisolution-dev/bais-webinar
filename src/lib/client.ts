"use client";

const k = (slug: string) => `bais-pass-${slug}`;

export function savePass(slug: string, pass: string, name: string) {
  try {
    localStorage.setItem(k(slug), JSON.stringify({ pass, name }));
  } catch {}
}
export function loadPass(slug: string): { pass: string; name: string } | null {
  try {
    const v = localStorage.getItem(k(slug));
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function fmtDate(iso: string) {
  const d = new Date(iso);
  const wd = ["日", "一", "二", "三", "四", "五", "六"];
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  const h = Number(g("hour"));
  const ampm = h < 12 ? "早上" : h < 18 ? "下午" : "晚上";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return {
    date: `${g("year")}年${g("month")}月${g("day")}日（星期${wd[dayIdx] ?? ""}）`,
    time: `${ampm} ${h12}:${g("minute")}（MY / SG 时间）`,
  };
}

export async function api<T = unknown>(url: string, body?: unknown, hostKey?: string): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(hostKey ? { "x-host-key": hostKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `错误 ${res.status}`);
  return data as T;
}

export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function money(cents: number, currency = "MYR") {
  const sym = currency === "MYR" ? "RM" : currency;
  const v = cents / 100;
  return `${sym} ${v.toLocaleString("en-MY", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function gcalUrl(title: string, startIso: string, durationMin: number, details: string, location = "") {
  const start = new Date(startIso);
  const end = new Date(start.getTime() + durationMin * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(start)}/${f(end)}`, details, location });
  return `https://calendar.google.com/calendar/render?${p}`;
}
