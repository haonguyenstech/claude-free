import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[11px] font-bold tracking-[0.02em]",
  {
    variants: {
      variant: {
        on: "bg-[#E6F4EA] text-positive",
        off: "bg-[#FCE8E6] text-destructive",
        env: "bg-secondary text-forest",
        pending: "bg-[#FEF7E0] text-[#B26A00]",
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
