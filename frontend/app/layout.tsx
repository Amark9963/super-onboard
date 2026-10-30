import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./styles.css";
import "./prototype/prototype.css";
export const metadata: Metadata = {
  title: "Super Onboard | Preparation Prototype",
  description: "Fictional, interactive agent onboarding preparation prototype",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
