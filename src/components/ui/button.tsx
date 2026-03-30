import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm text-sm font-medium uppercase tracking-[0.05em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-accent to-accent-hover text-white shadow-[0_2px_0_0_hsl(var(--accent-hover))] hover:brightness-110 active:shadow-none active:translate-y-[1px]",
        destructive:
          "bg-gradient-to-b from-danger to-danger-hover text-white shadow-[0_2px_0_0_hsl(var(--danger-hover))] hover:brightness-110 active:shadow-none active:translate-y-[1px]",
        outline:
          "border border-border/15 bg-surface-raised text-text-primary shadow-[0_2px_0_0_hsl(var(--border))] hover:bg-surface-overlay active:shadow-none active:translate-y-[1px]",
        secondary:
          "bg-surface-overlay text-text-primary shadow-[0_2px_0_0_hsl(var(--border))] hover:bg-surface-overlay/80 active:shadow-none active:translate-y-[1px]",
        ghost:
          "text-text-secondary hover:bg-surface-overlay hover:text-text-primary",
        link: "text-accent underline-offset-4 hover:underline normal-case tracking-normal",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-sm px-3 text-xs",
        lg: "h-10 rounded-sm px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
