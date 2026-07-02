"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, ArrowUpRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { LogoMark, Wordmark } from "@/components/brand/logo"

const NAV = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/status", label: "Status", external: true },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border-soft bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-3 px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="claude-free home">
          <LogoMark className="size-8" />
          <Wordmark className="text-[18px]" />
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = !item.external && pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {item.external ? <ArrowUpRight className="size-3.5" /> : null}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link
            href="/docs#install"
            className="rounded-full bg-primary px-4 py-2 text-[13.5px] font-bold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="ml-auto grid size-9 place-items-center rounded-lg text-foreground transition-colors hover:bg-secondary md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border-soft bg-background md:hidden">
          <nav className="mx-auto flex w-full max-w-[1120px] flex-col gap-1 px-5 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[14px] font-semibold text-foreground hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/docs#install"
              onClick={() => setOpen(false)}
              className="mt-1 rounded-full bg-primary px-4 py-2.5 text-center text-[14px] font-bold text-primary-foreground"
            >
              Get started
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  )
}
