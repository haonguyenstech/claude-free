import Link from "next/link"
import { ArrowRight, BadgeCheck, CheckCircle2, KeyRound, ListChecks, Sparkles, Terminal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CodeBlock } from "@/components/marketing/code-block"
import { SiteFooter } from "@/components/marketing/site-footer"
import { SiteHeader } from "@/components/marketing/site-header"
import { INSTALL, MODELS, TIERS } from "@/lib/marketing"

const features = [
  {
    icon: KeyRound,
    title: "One saved token",
    body: "Paste your access token once. claude-free stores it locally and reuses it on future runs.",
  },
  {
    icon: Sparkles,
    title: "Free model picker",
    body: "Choose OpenCode models from the CLI and launch Claude Code with the selected model.",
  },
  {
    icon: ListChecks,
    title: "Simple update path",
    body: "Run the same installer again when you want the newest claude-free client.",
  },
]

const flow = ["Install the client", "Paste your access token", "Pick a model", "Run Claude Code"]

export default function Home() {
  const defaultModel = MODELS.opencode.find((model) => model.star) ?? MODELS.opencode[0]

  return (
    <main className="min-h-screen bg-background">
      <SiteHeader />

      <section className="overflow-hidden border-b border-border-soft bg-[linear-gradient(180deg,#ffffff_0%,#f8f9fc_76%)]">
        <div className="mx-auto grid w-full max-w-[1120px] gap-10 px-5 py-14 lg:grid-cols-[1fr_440px] lg:items-center lg:py-20">
          <div className="min-w-0 cf-reveal">
            <Badge variant="env" className="cf-badge-glow">Claude Code CLI for free models</Badge>
            <h1 className="mt-5 max-w-[760px] text-[42px] font-extrabold leading-[1.04] tracking-normal text-foreground sm:text-[58px] lg:text-[68px]">
              claude-free
            </h1>
            <p className="mt-5 max-w-[680px] text-[17px] font-medium leading-8 text-muted-foreground sm:text-[19px]">
              Install claude-free, paste your access token, pick a model, and launch Claude Code from
              the same terminal workflow you already use.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row cf-reveal cf-delay-1">
              <Button asChild size="lg">
                <Link href="/docs#install">
                  Install guide <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs#configure">Token setup</Link>
              </Button>
            </div>

            <div className="mt-9 grid gap-2 sm:grid-cols-4">
              {flow.map((item, index) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-lg border border-border-soft bg-white px-3 py-2.5 text-[12.5px] font-bold shadow-[0_10px_24px_rgba(18,19,23,0.04)] cf-step-card"
                  style={{ animationDelay: `${180 + index * 85}ms` }}
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-[11px] text-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-xl)] border border-border bg-card p-3 shadow-[0_18px_60px_rgba(18,19,23,0.08)] cf-terminal-shell">
            <div className="relative overflow-hidden rounded-[calc(var(--radius-xl)-6px)] border border-forest-line bg-forest p-4 text-[#E6EAF0]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(50,121,249,0.18),rgba(50,121,249,0))] cf-terminal-sweep" />
              <div className="mb-4 flex items-center justify-between border-b border-forest-line pb-3">
                <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em] text-[#8E949F]">
                  <Terminal className="size-4" />
                  claude-free
                </div>
                <Badge variant="on" className="bg-[#E6F4EA] cf-ready-pulse">Ready</Badge>
              </div>
              <div className="relative space-y-3 font-mono text-[13px] leading-6">
                <p><span className="text-[#8E949F]">$</span> claude-free</p>
                <p className="text-[#8E949F]">server: https://your-proxy.example</p>
                <p className="text-[#8E949F]">token: saved in ~/.claude-free/keys.json</p>
                <div className="rounded-lg border border-forest-line bg-forest-2 p-3">
                  <p className="text-[#8E949F]">selected model</p>
                  <p className="mt-1 text-[15px] font-bold text-white">{defaultModel.name}</p>
                  <p className="mt-1 break-all text-[#AEB4C0]">{defaultModel.id}</p>
                </div>
                <p className="text-positive">Launching Claude Code through proxy<span className="cf-caret">...</span></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="install" className="border-b border-border-soft bg-background">
        <div className="mx-auto grid w-full max-w-[1120px] gap-7 px-5 py-14 lg:grid-cols-[330px_1fr]">
          <div>
            <h2 className="text-[28px] font-extrabold tracking-normal">Install in one command</h2>
            <p className="mt-3 text-[15px] font-medium leading-7 text-muted-foreground">
              The installer adds Node.js and Claude Code if missing, installs the picker, and creates the
              `claude-free` command.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link href="/docs#update">Update and configure</Link>
            </Button>
          </div>
          <div className="grid gap-4">
            <CodeBlock label={INSTALL.unix.label} code={INSTALL.unix.cmd} />
            <CodeBlock label={INSTALL.cmd.label} code={INSTALL.cmd.cmd} />
            <CodeBlock label={INSTALL.powershell.label} code={INSTALL.powershell.cmd} />
          </div>
        </div>
      </section>

      <section className="border-b border-border-soft bg-white">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-14">
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature, index) => (
              <article
                key={feature.title}
                className="rounded-[var(--radius-lg)] border border-border bg-card p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(18,19,23,0.08)] cf-reveal"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <feature.icon className="size-5 text-mint" />
                <h3 className="mt-4 text-[16px] font-extrabold">{feature.title}</h3>
                <p className="mt-2 text-[13.5px] font-medium leading-6 text-muted-foreground">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-background">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-14">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-[28px] font-extrabold tracking-normal">Model tiers</h2>
              <p className="mt-2 text-[15px] font-medium text-muted-foreground">Pick a ready model from the CLI and start coding.</p>
            </div>
            <Button asChild variant="ghost">
              <Link href="/docs#models">See model notes</Link>
            </Button>
          </div>

          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            {(["opencode", "clinepass"] as const).map((tier) => (
              <article key={tier} className="rounded-[var(--radius-lg)] border border-border bg-card p-5 cf-reveal">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[20px] font-extrabold">{TIERS[tier].name}</h3>
                    <p className="mt-1 text-[13.5px] font-medium text-muted-foreground">{TIERS[tier].blurb}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[20px] font-extrabold">{TIERS[tier].price}</p>
                    <p className="text-[12px] font-bold text-muted-foreground">{TIERS[tier].priceNote}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-2">
                  {MODELS[tier].slice(0, tier === "opencode" ? 5 : 6).map((model) => (
                    <div key={model.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2.5 transition duration-200 hover:bg-accent hover:text-accent-foreground">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold">{model.name}</p>
                        <p className="truncate text-[12px] font-medium text-muted-foreground">{model.id}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {model.star ? <BadgeCheck className="size-4 text-positive" /> : null}
                        {model.ctx ? <Badge variant="env">{model.ctx}</Badge> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border-soft bg-forest text-white">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-bold text-[#AEB4C0]">
              <CheckCircle2 className="size-4" />
              Ready after install
            </div>
            <h2 className="mt-3 text-[26px] font-extrabold tracking-normal">Run `claude-free`, choose a model, and start Claude Code.</h2>
          </div>
          <Button asChild size="lg" className="bg-white text-forest hover:bg-[#E6EAF0]">
            <Link href="/docs#install">Install now</Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
