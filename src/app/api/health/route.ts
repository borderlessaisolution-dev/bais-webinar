import { NextResponse } from "next/server";
import { db } from "@/lib/store";
import { provider } from "@/lib/payments";

/** 部署检查：环境变量有没有填、Supabase 表有没有建好（不会显示任何密码） */
export async function GET() {
  const env = (k: string) => !!process.env[k];
  const checks: Record<string, string> = {};
  const d = db();
  if (!d) checks.supabase = "❌ 没设 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（现在用内存，资料会不见）";
  else {
    for (const t of ["registrations", "activities", "responses", "live_state", "course_sessions", "orders"]) {
      const { error } = await d.from(t).select("*", { count: "exact", head: true });
      checks[t] = error ? `❌ ${error.message}` : "✅";
    }
  }
  return NextResponse.json({
    env: {
      NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "❌ 没设",
      LIVEKIT_API_KEY: env("LIVEKIT_API_KEY"),
      LIVEKIT_API_SECRET: env("LIVEKIT_API_SECRET"),
      SUPABASE_URL: process.env.SUPABASE_URL ?? "❌ 没设",
      SUPABASE_SERVICE_ROLE_KEY: env("SUPABASE_SERVICE_ROLE_KEY"),
      HOST_KEY: env("HOST_KEY"),
      APP_SECRET: env("APP_SECRET"),
      STRIPE_SECRET_KEY: env("STRIPE_SECRET_KEY"),
      payment: provider() ?? "未开通",
    },
    tables: checks,
  });
}
