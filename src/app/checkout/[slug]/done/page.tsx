import { notFound } from "next/navigation";
import { getWebinar, WEBINARS } from "@/lib/config";
import Done from "./Done";

export const metadata = { title: "报名结果", robots: { index: false } };

export function generateStaticParams() {
  return Object.keys(WEBINARS).map((slug) => ({ slug }));
}

export default async function Page({ params }: PageProps<"/checkout/[slug]/done">) {
  const w = getWebinar((await params).slug);
  if (!w) notFound();
  return <Done w={w} />;
}
