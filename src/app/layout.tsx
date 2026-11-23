import type { Metadata } from "next";
import { PracticeProvider } from "@/components/practice-provider";
import { ScoutProvider } from "@/components/scout-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prize Scout",
  description: "Check official contest pages. Web search from this app is not connected — ask Prize Scout chat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ScoutProvider>
          <PracticeProvider>
            <SiteHeader />
            {children}
          </PracticeProvider>
        </ScoutProvider>
      </body>
    </html>
  );
}
