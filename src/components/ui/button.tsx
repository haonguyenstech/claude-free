import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_rgba(24,224,140,0.55)] hover:-translate-y-px hover:shadow-[0_14px_28px_-10px_rgba(24,224,140,0.6)]",
        forest: "bg-forest text-[#eaf4ee] hover:bg-forest-2",
        outline:
          "border border-border bg-card text-foreground hover:border-neutral-300 hover:shadow-sm",
        ghost: "hover:bg-secondary hover:text-secondary-foreground",
        danger:
          "border border-[rgba(229,86,75,0.35)] bg-card text-destructive hover:bg-[#fdecea]",
        link: "text-positive underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 rounded-lg px-3",
        xs: "h-8 rounded-lg px-2.5 text-xs",
        lg: "h-12 rounded-xl px-6 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
