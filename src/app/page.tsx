import { redirect } from "next/navigation";
import { DEFAULT_SLUG } from "@/lib/config";

export default function Home() {
  redirect(`/w/${DEFAULT_SLUG}`);
}
