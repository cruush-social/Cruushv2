"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "./utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // The stock control was a 16px square on a light input surface with a
        // flat fill when checked, which is not what anything else in the app
        // looks like. It reads as a cruush control now: the glass surface and
        // white border the rest of the app uses, the gradient when it is on,
        // and a size a thumb can actually hit.
        "peer size-5 shrink-0 rounded-md border border-white/18 bg-white/[0.06] text-white shadow-none outline-none transition-colors",
        "data-[state=checked]:border-transparent data-[state=checked]:text-white data-[state=checked]:[background:var(--cruush-gradient)]",
        "focus-visible:ring-[3px] focus-visible:ring-white/45",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-4" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
