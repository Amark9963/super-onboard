import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "Super Onboard | Workspace",
  description: "Independent implementation requirements workspace",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
