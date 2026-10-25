import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/** Liquid switch: glass track, a lens thumb that stretches while pressed and springs into place. */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "group peer relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-foreground/15 p-0.5 transition-colors duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-foreground/15 shadow-[inset_0_1px_3px_oklch(0.2_0.02_245/28%)]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className="liquid-thumb pointer-events-none block h-5.5 w-5.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active:w-7.5 data-[state=checked]:translate-x-5 group-active:data-[state=checked]:translate-x-3 dark:data-[state=checked]:[background:linear-gradient(180deg,oklch(0.22_0.015_255),oklch(0.14_0.015_255))] dark:data-[state=checked]:shadow-[0_2px_6px_oklch(0_0_0/55%),inset_0_1px_0_oklch(0.35_0.02_250)]"
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
