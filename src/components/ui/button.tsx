import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 rounded-md text-[14px] font-medium tracking-[-0.01em] transition-colors disabled:pointer-events-none disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:opacity-90 disabled:bg-muted disabled:text-disabled",
        muted:
          "bg-muted text-muted-foreground hover:text-foreground disabled:text-disabled",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        chip: "bg-muted text-muted-foreground",
      },
      size: {
        sm: "h-[26px] px-2.5 text-[11px] rounded-md",
        md: "h-[42px] px-5 text-sm",
        lg: "h-[46px] px-6 text-[14px]",
        xl: "h-12 px-7 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "muted",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : "button"}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
