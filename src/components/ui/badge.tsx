import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-bold tracking-[0.02em]",
  {
    variants: {
      variant: {
        on: "bg-mint-soft text-positive",
        off: "bg-[#fdecea] text-destructive",
        env: "bg-secondary text-forest",
        pending: "bg-[#fff4e2] text-[#c77f10]",
        neutral: "bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
