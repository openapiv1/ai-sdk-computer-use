import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/react"

export const metadata: Metadata = {
  title: "AI SDK Computer Use Demo",
  description: "A Next.js app that uses the AI SDK and Qwen3-VL-Plus to create a computer using agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
