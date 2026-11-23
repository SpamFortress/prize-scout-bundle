"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { usePracticeOptional } from "@/components/practice-provider";
import { cn } from "@/lib/utils";

const LINKS = [
  ["/", "Home"],
  ["/saved", "Saved"],
  ["/entries", "Entries"],
  ["/profile", "Profile"],
  ["/about", "About"],
] as const;

const PRACTICE_LINKS = [
  ["/practice", "Home"],
  ["/practice/saved", "Saved"],
  ["/practice/entries", "Entries"],
  ["/practice/profile", "Profile"],
  ["/about", "About"],
] as const;

function itemClass(active: boolean) {
  return cn(
    "rounded-full px-3 py-2 text-base font-medium text-[#202124] hover:bg-[#f1f3f4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1a73e8]",
    active && "bg-[#f1f3f4]",
  );
}

function linkCurrent(href: string, pathname: string): boolean {
  if (href === "/practice") return pathname === "/practice";
  return pathname === href;
}

export function SiteHeader() {
  const pathname = usePathname();
  const practice = usePracticeOptional();
  const [stickPractice, setStickPractice] = useState(false);
  useEffect(() => {
    if (pathname.startsWith("/practice") || pathname.startsWith("/design-preview")) setStickPractice(true);
  }, [pathname]);
  const showPractice = stickPractice || pathname.startsWith("/practice") || pathname.startsWith("/design-preview");
  const links = showPractice ? PRACTICE_LINKS : LINKS;
  const hideWordmark = pathname === "/practice" && (practice?.homeAtFront ?? true);
  return (
    <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center border-b border-[#ebebeb] bg-white px-3 sm:px-5" style={{ backgroundColor: "#ffffff", opacity: 1 }}>
      {showPractice && !hideWordmark ? (
        <Link href="/practice?front=1" className="text-lg font-normal text-[#202124] hover:underline" onClick={() => practice?.prepareFront()}>
          Prize Scout
        </Link>
      ) : null}
      <nav aria-label="Primary" className="ml-auto hidden items-center gap-0.5 md:flex">
        {links.map(([href, label]) => (
          <Link key={href} href={href} aria-current={linkCurrent(href, pathname) ? "page" : undefined} className={itemClass(linkCurrent(href, pathname))}>
            {label}
          </Link>
        ))}
      </nav>
      <details className="relative ml-auto md:hidden">
        <summary className="cursor-pointer list-none rounded-full px-4 py-2 text-base font-medium text-[#202124] hover:bg-[#f1f3f4] [&::-webkit-details-marker]:hidden">
          Menu
        </summary>
        <nav aria-label="Primary" className="absolute right-0 mt-2 min-w-44 rounded-xl border border-[#dfe1e5] bg-white p-2 shadow-[0_1px_6px_rgba(32,33,36,0.18)]">
          {links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={linkCurrent(href, pathname) ? "page" : undefined} className="block rounded-lg px-3 py-2 text-base text-[#202124] hover:bg-[#f8f9fa]">
              {label}
            </Link>
          ))}
        </nav>
      </details>
    </header>
  );
}
