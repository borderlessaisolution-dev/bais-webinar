import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Activity, LeaderRow, LiveState, Registration } from "./types";

/**
 * 数据层：正式环境用 Supabase；本地没设 SUPABASE_URL 时用内存（只供测试，重启就没了）。
 */
export interface Store {
  addRegistration(r: Omit<Registration, "id" | "created_at" | "joined_at">): Promise<Registration>;
  findRegistration(slug: string, contact: string): Promise<Registration | null>;
  getRegistration(id: string): Promise<Registration | null>;
  markJoined(id: string): Promise<void>;
  listRegistrations(slug: string): Promise<Registration[]>;

  listActivities(slug: string): Promise<Activity[]>;
  getActivity(id: string): Promise<Activity | null>;
  upsertActivity(a: Omit<Activity, "id"> & { id?: string }): Promise<Activity>;
  deleteActivity(id: string): Promise<void>;

  getState(slug: string): Promise<LiveState>;
  setState(slug: string, s: LiveState): Promise<void>;

  addResponse(r: {
    webinar_slug: string;
    activity_id: string;
    registration_id: string;
    choice: number;
    correct: boolean | null;
    points: number;
    elapsed_ms: number;
  }): Promise<"ok" | "duplicate">;
  counts(activityId: string, nOptions: number): Promise<number[]>;
  leaderboard(slug: string, limit?: number): Promise<LeaderRow[]>;
  resetResponses(slug: string): Promise<void>;
}

export function normPhone(p: string) {
  let d = p.replace(/[^\d]/g, "");
  if (d.startsWith("0")) d = "6" + d; // 012… → 6012…（马来西亚）
  return d;
}

/** 学员进教室时随手打的号码，可能没有国码 */
export function phoneCandidates(p: string) {
  const d = p.replace(/[^\d]/g, "");
  const set = new Set([normPhone(d), "60" + d.replace(/^0+/, ""), "65" + d]);
  return [...set];
}

// ---------- Supabase ----------
class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}

  async addRegistration(r: Omit<Registration, "id" | "created_at" | "joined_at">) {
    const { data, error } = await this.db
      .from("registrations")
      .upsert(r, { onConflict: "webinar_slug,phone" })
      .select()
      .single();
    if (error) throw error;
    return data as Registration;
  }
  async findRegistration(slug: string, contact: string) {
    const c = contact.trim();
    const q = this.db.from("registrations").select().eq("webinar_slug", slug).limit(1);
    const { data, error } = c.includes("@")
      ? await q.ilike("email", c)
      : await q.in("phone", phoneCandidates(c));
    if (error) throw error;
    return (data?.[0] as Registration) ?? null;
  }
  async getRegistration(id: string) {
    const { data } = await this.db.from("registrations").select().eq("id", id).maybeSingle();
    return (data as Registration) ?? null;
  }
  async markJoined(id: string) {
    await this.db
      .from("registrations")
      .update({ joined_at: new Date().toISOString() })
      .eq("id", id)
      .is("joined_at", null);
  }
  async listRegistrations(slug: string) {
    const { data, error } = await this.db
      .from("registrations")
      .select()
      .eq("webinar_slug", slug)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (error) throw error;
    return data as Registration[];
  }
  async listActivities(slug: string) {
    const { data, error } = await this.db
      .from("activities")
      .select()
      .eq("webinar_slug", slug)
      .order("sort")
      .order("created_at");
    if (error) throw error;
    return data as Activity[];
  }
  async getActivity(id: string) {
    const { data } = await this.db.from("activities").select().eq("id", id).maybeSingle();
    return (data as Activity) ?? null;
  }
  async upsertActivity(a: Omit<Activity, "id"> & { id?: string }) {
    const { data, error } = await this.db.from("activities").upsert(a).select().single();
    if (error) throw error;
    return data as Activity;
  }
  async deleteActivity(id: string) {
    await this.db.from("activities").delete().eq("id", id);
  }
  async getState(slug: string): Promise<LiveState> {
    const { data } = await this.db
      .from("live_state")
      .select("state")
      .eq("webinar_slug", slug)
      .maybeSingle();
    return (data?.state as LiveState) ?? { kind: "idle", v: 0 };
  }
  async setState(slug: string, s: LiveState) {
    const { error } = await this.db
      .from("live_state")
      .upsert({ webinar_slug: slug, state: s, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
  async addResponse(r: Parameters<Store["addResponse"]>[0]) {
    const { error } = await this.db.from("responses").insert(r);
    if (error) {
      if (error.code === "23505") return "duplicate" as const;
      throw error;
    }
    return "ok" as const;
  }
  async counts(activityId: string, n: number) {
    const { data, error } = await this.db.rpc("activity_counts", { p_activity: activityId });
    if (error) throw error;
    const out = Array(n).fill(0);
    for (const row of (data ?? []) as { choice: number; total: number }[]) {
      if (row.choice >= 0 && row.choice < n) out[row.choice] = Number(row.total);
    }
    return out;
  }
  async leaderboard(slug: string, limit = 10) {
    const { data, error } = await this.db.rpc("leaderboard", { p_slug: slug, p_limit: limit });
    if (error) throw error;
    return ((data ?? []) as { registration_id: string; name: string; score: number }[]).map(
      (r) => ({ id: r.registration_id, name: r.name, score: Number(r.score) })
    );
  }
  async resetResponses(slug: string) {
    await this.db.from("responses").delete().eq("webinar_slug", slug);
  }
}

// ---------- 内存（本地测试） ----------
type Mem = {
  regs: Registration[];
  acts: Activity[];
  states: Record<string, LiveState>;
  resp: (Parameters<Store["addResponse"]>[0] & { created_at: number })[];
};
class MemoryStore implements Store {
  m: Mem;
  constructor() {
    const g = globalThis as unknown as { __baisMem?: Mem };
    g.__baisMem ??= { regs: [], acts: [], states: {}, resp: [] };
    this.m = g.__baisMem;
  }
  async addRegistration(r: Omit<Registration, "id" | "created_at" | "joined_at">) {
    const ex = this.m.regs.find((x) => x.webinar_slug === r.webinar_slug && x.phone === r.phone);
    if (ex) return Object.assign(ex, r);
    const row: Registration = {
      ...r,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      joined_at: null,
    };
    this.m.regs.unshift(row);
    return row;
  }
  async findRegistration(slug: string, contact: string) {
    const c = contact.trim().toLowerCase();
    return (
      this.m.regs.find(
        (r) =>
          r.webinar_slug === slug &&
          (c.includes("@") ? r.email.toLowerCase() === c : phoneCandidates(c).includes(r.phone))
      ) ?? null
    );
  }
  async getRegistration(id: string) {
    return this.m.regs.find((r) => r.id === id) ?? null;
  }
  async markJoined(id: string) {
    const r = this.m.regs.find((x) => x.id === id);
    if (r && !r.joined_at) r.joined_at = new Date().toISOString();
  }
  async listRegistrations(slug: string) {
    return this.m.regs.filter((r) => r.webinar_slug === slug);
  }
  async listActivities(slug: string) {
    return this.m.acts.filter((a) => a.webinar_slug === slug).sort((a, b) => a.sort - b.sort);
  }
  async getActivity(id: string) {
    return this.m.acts.find((a) => a.id === id) ?? null;
  }
  async upsertActivity(a: Omit<Activity, "id"> & { id?: string }) {
    const ex = a.id ? this.m.acts.find((x) => x.id === a.id) : undefined;
    if (ex) return Object.assign(ex, a);
    const row = { ...a, id: crypto.randomUUID() } as Activity;
    this.m.acts.push(row);
    return row;
  }
  async deleteActivity(id: string) {
    this.m.acts = this.m.acts.filter((a) => a.id !== id);
  }
  async getState(slug: string) {
    return this.m.states[slug] ?? { kind: "idle", v: 0 };
  }
  async setState(slug: string, s: LiveState) {
    this.m.states[slug] = s;
  }
  async addResponse(r: Parameters<Store["addResponse"]>[0]) {
    if (this.m.resp.some((x) => x.activity_id === r.activity_id && x.registration_id === r.registration_id))
      return "duplicate" as const;
    this.m.resp.push({ ...r, created_at: Date.now() });
    return "ok" as const;
  }
  async counts(activityId: string, n: number) {
    const out = Array(n).fill(0);
    for (const r of this.m.resp) if (r.activity_id === activityId && r.choice < n) out[r.choice]++;
    return out;
  }
  async leaderboard(slug: string, limit = 10) {
    const tot = new Map<string, number>();
    for (const r of this.m.resp)
      if (r.webinar_slug === slug && r.points > 0)
        tot.set(r.registration_id, (tot.get(r.registration_id) ?? 0) + r.points);
    return [...tot.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({ id, score, name: this.m.regs.find((x) => x.id === id)?.name ?? "?" }));
  }
  async resetResponses(slug: string) {
    this.m.resp = this.m.resp.filter((r) => r.webinar_slug !== slug);
  }
}

let _store: Store | null = null;
export function store(): Store {
  if (_store) return _store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  _store =
    url && key
      ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }))
      : new MemoryStore();
  return _store;
}
