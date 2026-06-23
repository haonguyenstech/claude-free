import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-xl border border-input bg-card px-3 font-mono text-[13px] outline-none transition-all",
        "placeholder:font-sans placeholder:text-neutral-400",
        "focus-visible:border-mint focus-visible:ring-4 focus-visible:ring-mint-soft",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
