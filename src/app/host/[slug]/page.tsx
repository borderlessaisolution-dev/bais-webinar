import { notFound } from "next/navigation";
import { getWebinar, WEBINARS } from "@/lib/config";
import Host from "./Host";

export const metadata = { title: "老师控制台 · BAIS Webinar", robots: { index: false } };

export function generateStaticParams() {
  return Object.keys(WEBINARS).map((slug) => ({ slug }));
}

export default async function Page({ params }: PageProps<"/host/[slug]">) {
  const w = getWebinar((await params).slug);
  if (!w) notFound();
  return <Host w={w} />;
}
