import Link from "next/link"
import { ArrowUpRight } from "lucide-react"

import { LogoMark, Wordmark } from "@/components/brand/logo"

export function SiteFooter() {
  return (
    <footer className="border-t border-border-soft">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <div>
            <Wordmark className="text-[16px]" />
            <p className="text-[12.5px] text-muted-foreground">Claude Code on free models.</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] font-semibold text-muted-foreground">
          <Link href="/docs" className="transition-colors hover:text-foreground">
            Docs
          </Link>
          <Link href="/docs#install" className="transition-colors hover:text-foreground">
            Install
          </Link>
          <Link href="/policy" className="transition-colors hover:text-foreground">
            Policy
          </Link>
          <Link href="/status" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-foreground">
            Status <ArrowUpRight className="size-3.5" />
          </Link>
          <a
            href="https://github.com/haonguyenstech/claude-free"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            GitHub <ArrowUpRight className="size-3.5" />
          </a>
        </nav>
      </div>
    </footer>
  )
}
