import type { Metadata } from "next";
import CustomerReview from "./customer-review";

export const metadata: Metadata = {
  title: "Review request",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <CustomerReview token={token} />;
}
