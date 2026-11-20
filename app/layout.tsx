import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workday Clone — Leave & Claims",
  description: "Leave requests, expense claims, approvals and the master leave record, powered by Supabase.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
