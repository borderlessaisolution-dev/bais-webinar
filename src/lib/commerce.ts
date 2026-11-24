import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "./store";
import type { CourseSession, Order, SessionAvail } from "./types";

/** 没付款的名额保留多久（Stripe Checkout 最短 30 分钟，所以留 35） */
export const HOLD_MINUTES = 35;

export type NewOrder = {
  slug: string;
  sessionId: string;
  registrationId: string | null;
  name: string;
  email: string;
  phone: string;
  amount: number;
  currency: string;
  provider: string;
  source: string | null;
};

export interface Commerce {
  getOffer(slug: string): Promise<{ open: boolean; v: number }>;
  setOffer(slug: string, open: boolean): Promise<{ open: boolean; v: number }>;
  sessions(slug: string): Promise<SessionAvail[]>;
  upsertSession(s: Omit<CourseSession, "id"> & { id?: string }): Promise<CourseSession>;
  deleteSession(id: string): Promise<"deleted" | "deactivated">;
  createOrder(o: NewOrder): Promise<Order>;
  getOrder(id: string): Promise<Order | null>;
  findOrderByRef(ref: string): Promise<Order | null>;
  updateOrder(id: string, patch: Partial<Order>): Promise<void>;
  listOrders(slug: string): Promise<Order[]>;
}

export class SeatError extends Error {}

const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function orderCode() {
  let s = "";
  const r = crypto.getRandomValues(new Uint8Array(6));
  for (const b of r) s += ALPHA[b % ALPHA.length];
  return `BW-${s}`;
}

const avail = (s: CourseSession, taken: number, paid: number): SessionAvail => ({
  ...s,
  taken,
  paid,
  seats_left: Math.max(0, s.capacity - taken),
});

// ---------- Supabase ----------
class SupabaseCommerce implements Commerce {
  constructor(private d: SupabaseClient) {}
  async getOffer(slug: string) {
    const { data } = await this.d.from("live_state").select("offer_open, offer_v").eq("webinar_slug", slug).maybeSingle();
    return { open: !!data?.offer_open, v: Number(data?.offer_v ?? 0) };
  }
  async setOffer(slug: string, open: boolean) {
    const v = Date.now();
    const { data } = await this.d.from("live_state").select("webinar_slug").eq("webinar_slug", slug).maybeSingle();
    const q = data
      ? this.d.from("live_state").update({ offer_open: open, offer_v: v }).eq("webinar_slug", slug)
      : this.d.from("live_state").insert({ webinar_slug: slug, state: { kind: "idle", v: 0 }, offer_open: open, offer_v: v });
    const { error } = await q;
    if (error) throw error;
    return { open, v };
  }
  async sessions(slug: string) {
    const { data, error } = await this.d.rpc("session_availability", { p_slug: slug });
    if (error) throw error;
    return ((data ?? []) as (CourseSession & { taken: number; paid: number })[]).map((r) =>
      avail({ ...r, webinar_slug: slug }, Number(r.taken), Number(r.paid))
    );
  }
  async upsertSession(s: Omit<CourseSession, "id"> & { id?: string }) {
    const { data, error } = await this.d.from("course_sessions").upsert(s).select().single();
    if (error) throw error;
    return data as CourseSession;
  }
  async deleteSession(id: string) {
    const { count } = await this.d.from("orders").select("id", { count: "exact", head: true }).eq("session_id", id);
    if (count) {
      await this.d.from("course_sessions").update({ active: false }).eq("id", id);
      return "deactivated" as const;
    }
    await this.d.from("course_sessions").delete().eq("id", id);
    return "deleted" as const;
  }
  async createOrder(o: NewOrder) {
    const { data, error } = await this.d.rpc("create_order", {
      p_slug: o.slug,
      p_session: o.sessionId,
      p_reg: o.registrationId,
      p_name: o.name,
      p_email: o.email,
      p_phone: o.phone,
      p_amount: o.amount,
      p_currency: o.currency,
      p_provider: o.provider,
      p_hold_minutes: HOLD_MINUTES,
      p_code: orderCode(),
      p_source: o.source,
    });
    if (error) {
      if (error.message.includes("SESSION_FULL")) throw new SeatError("这个日期已经满了，请选其他日期");
      if (error.message.includes("SESSION_NOT_FOUND")) throw new SeatError("这个日期已经关闭");
      throw error;
    }
    return data as Order;
  }
  async getOrder(id: string) {
    const { data } = await this.d.from("orders").select().eq("id", id).maybeSingle();
    return (data as Order) ?? null;
  }
  async findOrderByRef(ref: string) {
    const { data } = await this.d.from("orders").select().eq("provider_ref", ref).maybeSingle();
    return (data as Order) ?? null;
  }
  async updateOrder(id: string, patch: Partial<Order>) {
    const { error } = await this.d.from("orders").update(patch).eq("id", id);
    if (error) throw error;
  }
  async listOrders(slug: string) {
    const { data, error } = await this.d
      .from("orders")
      .select()
      .eq("webinar_slug", slug)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    return data as Order[];
  }
}

// ---------- 内存（本地测试） ----------
type Mem = { offer: Record<string, { open: boolean; v: number }>; sessions: CourseSession[]; orders: Order[] };
class MemoryCommerce implements Commerce {
  m: Mem;
  constructor() {
    const g = globalThis as unknown as { __baisCom?: Mem };
    g.__baisCom ??= { offer: {}, sessions: [], orders: [] };
    this.m = g.__baisCom;
  }
  async getOffer(slug: string) {
    return this.m.offer[slug] ?? { open: false, v: 0 };
  }
  async setOffer(slug: string, open: boolean) {
    return (this.m.offer[slug] = { open, v: Date.now() });
  }
  private counts(id: string) {
    const now = Date.now();
    const os = this.m.orders.filter((o) => o.session_id === id);
    const paid = os.filter((o) => o.status === "paid").length;
    const held = os.filter((o) => o.status === "pending" && new Date(o.hold_expires_at).getTime() > now).length;
    return { taken: paid + held, paid };
  }
  async sessions(slug: string) {
    return this.m.sessions
      .filter((s) => s.webinar_slug === slug)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .map((s) => {
        const c = this.counts(s.id);
        return avail(s, c.taken, c.paid);
      });
  }
  async upsertSession(s: Omit<CourseSession, "id"> & { id?: string }) {
    const ex = s.id ? this.m.sessions.find((x) => x.id === s.id) : undefined;
    if (ex) return Object.assign(ex, s);
    const row = { ...s, id: crypto.randomUUID() } as CourseSession;
    this.m.sessions.push(row);
    return row;
  }
  async deleteSession(id: string) {
    if (this.m.orders.some((o) => o.session_id === id)) {
      const s = this.m.sessions.find((x) => x.id === id);
      if (s) s.active = false;
      return "deactivated" as const;
    }
    this.m.sessions = this.m.sessions.filter((s) => s.id !== id);
    return "deleted" as const;
  }
  async createOrder(o: NewOrder) {
    const s = this.m.sessions.find((x) => x.id === o.sessionId && x.webinar_slug === o.slug && x.active);
    if (!s) throw new SeatError("这个日期已经关闭");
    for (const x of this.m.orders)
      if (x.webinar_slug === o.slug && x.email.toLowerCase() === o.email.toLowerCase() && x.status === "pending")
        x.status = "cancelled";
    if (this.counts(s.id).taken >= s.capacity) throw new SeatError("这个日期已经满了，请选其他日期");
    const row: Order = {
      id: crypto.randomUUID(),
      code: orderCode(),
      webinar_slug: o.slug,
      session_id: o.sessionId,
      registration_id: o.registrationId,
      name: o.name,
      email: o.email,
      phone: o.phone,
      amount: o.amount,
      currency: o.currency,
      status: "pending",
      provider: o.provider,
      provider_ref: null,
      hold_expires_at: new Date(Date.now() + HOLD_MINUTES * 60000).toISOString(),
      source: o.source,
      created_at: new Date().toISOString(),
      paid_at: null,
    };
    this.m.orders.unshift(row);
    return row;
  }
  async getOrder(id: string) {
    return this.m.orders.find((o) => o.id === id) ?? null;
  }
  async findOrderByRef(ref: string) {
    return this.m.orders.find((o) => o.provider_ref === ref) ?? null;
  }
  async updateOrder(id: string, patch: Partial<Order>) {
    const o = this.m.orders.find((x) => x.id === id);
    if (o) Object.assign(o, patch);
  }
  async listOrders(slug: string) {
    return this.m.orders.filter((o) => o.webinar_slug === slug);
  }
}

let _c: Commerce | null = null;
export function commerce(): Commerce {
  if (_c) return _c;
  const d = db();
  _c = d ? new SupabaseCommerce(d) : new MemoryCommerce();
  return _c;
}

/** 付款成功：只会从 pending/expired/cancelled 变 paid 一次 */
export async function markPaid(order: Order, ref?: string | null) {
  if (order.status === "paid") return;
  await commerce().updateOrder(order.id, {
    status: "paid",
    paid_at: new Date().toISOString(),
    ...(ref ? { provider_ref: ref } : {}),
  });
}
