import { forwardRef, type ElementType, type HTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  asChild?: boolean;
  variant?: "default" | "panel" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
}

const variantClasses: Record<NonNullable<GlassCardProps["variant"]>, string> = {
  default: "rounded-[1.5rem] sm:rounded-[2rem] lg:rounded-[2.25rem]",
  panel: "rounded-[1.25rem] sm:rounded-[1.5rem] lg:rounded-[1.75rem]",
  interactive:
    "rounded-[1.5rem] sm:rounded-[2rem] lg:rounded-[2.25rem] transition-transform duration-700 ease-[cubic-bezier(0.34,1.45,0.64,1)] hover:-translate-y-1.5 hover:scale-[1.015]",
};

const paddingClasses: Record<NonNullable<GlassCardProps["padding"]>, string> = {
  none: "",
  sm: "p-3.5 sm:p-4",
  md: "p-5 sm:p-6 lg:p-8",
  lg: "px-5 py-8 sm:px-9 sm:py-11",
};

export const GlassCard = forwardRef<HTMLElement, GlassCardProps>(
  (
    {
      as: Component = "div",
      asChild = false,
      variant = "default",
      padding = "md",
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : Component;
    return (
      <Comp
        ref={ref}
        className={cn(
          "glass",
          variantClasses[variant],
          paddingClasses[padding],
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

GlassCard.displayName = "GlassCard";
export default GlassCard;
