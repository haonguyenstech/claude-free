import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, RefreshCw, ShieldCheck, Terminal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/marketing/code-block"
import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"
import { INSTALL, MODELS, TIERS } from "@/lib/marketing"

export const metadata: Metadata = {
  title: "Docs",
  description: "Install, update, configure, and use claude-free.",
}

const setupSteps = [
  "Run the installer for your OS.",
  "Open a new terminal so PATH changes are loaded.",
  "Run claude-free.",
  "Paste your access token when prompted.",
  "Pick a model and start Claude Code.",
]

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string
  title: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-border-soft py-12">
      <div className="mb-6">
        <h2 className="text-[28px] font-extrabold tracking-[-0.03em]">{title}</h2>
        <p className="mt-2 max-w-[760px] text-[15px] font-medium leading-7 text-muted-foreground">{intro}</p>
      </div>
      {children}
    </section>
  )
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <div className="mx-auto grid w-full max-w-[1120px] gap-8 px-5 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 flex flex-col gap-1 py-10 text-[13px] font-bold text-muted-foreground">
            <a href="#install" className="rounded-lg px-3 py-2 hover:bg-secondary hover:text-foreground">Install</a>
            <a href="#update" className="rounded-lg px-3 py-2 hover:bg-secondary hover:text-foreground">Update</a>
            <a href="#configure" className="rounded-lg px-3 py-2 hover:bg-secondary hover:text-foreground">Configure</a>
            <a href="#models" className="rounded-lg px-3 py-2 hover:bg-secondary hover:text-foreground">Models</a>
            <a href="#troubleshooting" className="rounded-lg px-3 py-2 hover:bg-secondary hover:text-foreground">Troubleshooting</a>
          </nav>
        </aside>

        <div className="min-w-0">
          <section className="py-12 lg:py-16">
            <Badge variant="env">Documentation</Badge>
            <h1 className="mt-4 max-w-[780px] text-[40px] font-extrabold leading-[1.06] tracking-[-0.04em] sm:text-[56px]">
              Install, update, and operate claude-free.
            </h1>
            <p className="mt-5 max-w-[760px] text-[17px] font-medium leading-8 text-muted-foreground">
              Use this guide for client setup, token configuration, model selection, updates, and
              common recovery steps.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <a href="#install">
                  Start install <ArrowRight />
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Back to landing</Link>
              </Button>
            </div>
          </section>

          <Section
            id="install"
            title="Install"
            intro="The installer checks for Node.js and Claude Code, downloads the claude-free picker, and adds the claude-free command to PATH."
          >
            <div className="grid gap-4">
              <CodeBlock label={INSTALL.unix.label} code={INSTALL.unix.cmd} />
              <CodeBlock label={INSTALL.cmd.label} code={INSTALL.cmd.cmd} />
              <CodeBlock label={INSTALL.powershell.label} code={INSTALL.powershell.cmd} />
            </div>
            <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold">
                <Terminal className="size-4 text-mint" />
                First run
              </h3>
              <ol className="mt-4 grid gap-3">
                {setupSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-[14px] font-medium text-muted-foreground">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[12px] font-bold text-foreground">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Section>

          <Section
            id="update"
            title="Update"
            intro="Run the same installer again to refresh the local picker script. Your saved token remains in ~/.claude-free/keys.json."
          >
            <div className="grid gap-4">
              <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
                <h3 className="flex items-center gap-2 text-[16px] font-extrabold">
                  <RefreshCw className="size-4 text-mint" />
                  Client update
                </h3>
                <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">
                  Re-run the installer for your platform. Then open a new terminal and run `claude-free`.
                </p>
              </div>
            </div>
          </Section>

          <Section
            id="configure"
            title="Configure the client"
            intro="Most users only need an access token. You can also set the server URL and token through environment variables."
          >
            <div className="grid gap-4">
              <CodeBlock label="run with env vars" code={`CLAUDE_FREE_SERVER=https://your-domain.example CLAUDE_FREE_TOKEN=your-token claude-free`} />
              <CodeBlock label="saved config location" code={`~/.claude-free/keys.json
%USERPROFILE%\\.claude-free\\keys.json`} />
            </div>
            <div className="mt-5 rounded-[var(--radius-lg)] border border-border bg-card p-5">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold">
                <ShieldCheck className="size-4 text-positive" />
                Security model
              </h3>
              <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">
                Your machine stores only the access token and optional server URL in the claude-free
                config file. You do not need to manage provider keys in the CLI.
              </p>
            </div>
          </Section>

          <Section
            id="models"
            title="Models"
            intro="OpenCode works without a client-side account. ClinePass models appear when your access token can use them."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              {(["opencode", "clinepass"] as const).map((tier) => (
                <article key={tier} className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[18px] font-extrabold">{TIERS[tier].name}</h3>
                      <p className="mt-1 text-[13px] font-medium text-muted-foreground">{TIERS[tier].blurb}</p>
                    </div>
                    <Badge variant={tier === "opencode" ? "on" : "env"}>{TIERS[tier].price}</Badge>
                  </div>
                  <div className="mt-5 grid gap-2">
                    {MODELS[tier].map((model) => (
                      <div key={model.id} className="rounded-lg bg-secondary px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-[13px] font-bold">{model.name}</p>
                          <div className="flex shrink-0 items-center gap-2">
                            {model.ctx ? <Badge variant="env">{model.ctx}</Badge> : null}
                          </div>
                        </div>
                        <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground">{model.id} · {model.note}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section
            id="troubleshooting"
            title="Troubleshooting"
            intro="Most problems are PATH, token, server URL, or missing backend credential issues."
          >
            <div className="grid gap-4">
              {[
                ["`claude-free` not found", "Open a new terminal after installing. On Windows, use a new Command Prompt so PATH updates are loaded."],
                ["Token rejected", "Check that you pasted the full access token. If it still fails, request a fresh token."],
                ["Model request fails", "Try another model from the picker, then run `claude-free` again after a short wait."],
              ].map(([title, body]) => (
                <article key={title} className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
                  <h3 className="text-[15px] font-extrabold">{title}</h3>
                  <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </Section>
        </div>
      </div>

      <SiteFooter />
    </main>
  )
}
