import type { Metadata } from "next"
import Link from "next/link"
import { Database, FileText, KeyRound, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"

export const metadata: Metadata = {
  title: "Privacy & Usage Policy",
  description: "Privacy, token handling, logging, and acceptable-use policy for claude-free.",
}

const policySections = [
  {
    id: "privacy",
    icon: ShieldCheck,
    title: "Privacy",
    body: [
      "claude-free is designed to run under your control. The client stores its access token and optional server URL on your machine, not in a hosted claude-free account.",
      "When you send a model request through a proxy server, the server operator may process prompt content, response content, metadata, and request timing as needed to provide the service.",
    ],
  },
  {
    id: "tokens",
    icon: KeyRound,
    title: "Token handling",
    body: [
      "Treat access tokens like passwords. Do not commit them to Git, paste them into public issue trackers, or share them in screenshots.",
      "The CLI configuration is stored in your user profile, usually `~/.claude-free/keys.json` on macOS/Linux or `%USERPROFILE%\\.claude-free\\keys.json` on Windows.",
    ],
  },
  {
    id: "logs",
    icon: Database,
    title: "Logs and diagnostics",
    body: [
      "A self-hosted proxy may keep operational logs for debugging, rate limiting, abuse prevention, health checks, and traffic reporting.",
      "Avoid sending secrets, private keys, customer data, or confidential source code unless you trust the proxy operator and the upstream model provider handling the request.",
    ],
  },
  {
    id: "acceptable-use",
    icon: TriangleAlert,
    title: "Acceptable use",
    body: [
      "Do not use claude-free to bypass access controls, attack services, exfiltrate data, generate malware, or violate the terms of upstream providers.",
      "You are responsible for requests made with your token and for complying with the laws, workplace policies, and provider terms that apply to your use.",
    ],
  },
] as const

export default function PolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="border-b border-border-soft bg-[linear-gradient(180deg,#ffffff_0%,#f8f9fc_84%)]">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-14 lg:py-18">
          <Badge variant="env">Policy</Badge>
          <h1 className="mt-5 max-w-[760px] text-[40px] font-extrabold leading-[1.06] tracking-normal text-foreground sm:text-[56px]">
            Privacy & Usage Policy
          </h1>
          <p className="mt-5 max-w-[760px] text-[17px] font-medium leading-8 text-muted-foreground">
            This page explains how claude-free handles local configuration, proxy traffic, logs,
            tokens, and responsible use. Last updated July 3, 2026.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/docs#configure">Configure safely</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back home</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border-soft">
        <div className="mx-auto grid w-full max-w-[1120px] gap-6 px-5 py-12 md:grid-cols-3">
          <article className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
            <LockKeyhole className="size-5 text-mint" />
            <h2 className="mt-4 text-[17px] font-extrabold">Local-first client</h2>
            <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">
              The picker keeps client config on your device unless you choose to send requests to a proxy.
            </p>
          </article>
          <article className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
            <Database className="size-5 text-mint" />
            <h2 className="mt-4 text-[17px] font-extrabold">Operator-controlled logs</h2>
            <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">
              Self-hosted server logs depend on the deployment owner, database, and retention settings.
            </p>
          </article>
          <article className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
            <FileText className="size-5 text-mint" />
            <h2 className="mt-4 text-[17px] font-extrabold">Provider terms still apply</h2>
            <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">
              Model providers and networks may apply their own usage rules, logging, and restrictions.
            </p>
          </article>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto grid w-full max-w-[1120px] gap-8 px-5 py-12 lg:grid-cols-[220px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-20 flex flex-col gap-1 text-[13px] font-bold text-muted-foreground">
              {policySections.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="rounded-lg px-3 py-2 hover:bg-secondary hover:text-foreground">
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            {policySections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 border-b border-border-soft py-9 last:border-b-0">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-mint">
                    <section.icon className="size-5" />
                  </span>
                  <h2 className="text-[24px] font-extrabold tracking-normal">{section.title}</h2>
                </div>
                <div className="mt-5 grid gap-4">
                  {section.body.map((item) => (
                    <p key={item} className="max-w-[820px] text-[15px] font-medium leading-7 text-muted-foreground">
                      {item}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
              <h2 className="text-[18px] font-extrabold tracking-normal">Contact and changes</h2>
              <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">
                For project issues or policy updates, use the GitHub repository. Deployment owners should
                publish their own retention, access, and incident-response practices when offering a
                shared proxy to other users.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <a href="https://github.com/haonguyenstech/claude-free" target="_blank" rel="noreferrer">
                  Open GitHub
                </a>
              </Button>
            </section>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
