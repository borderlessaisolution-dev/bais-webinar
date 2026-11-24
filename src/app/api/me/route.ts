import { NextResponse } from "next/server";
import { bad, verifyAttendee } from "@/lib/server";
import { store } from "@/lib/store";

/** 用报名凭证帮付款页预先填好资料 */
export async function GET(req: Request) {
  const id = verifyAttendee(new URL(req.url).searchParams.get("pass"));
  if (!id) return bad("no pass", 401);
  const r = await store().getRegistration(id);
  if (!r) return bad("not found", 404);
  return NextResponse.json({ name: r.name, email: r.email, phone: r.phone, country: r.country });
}
