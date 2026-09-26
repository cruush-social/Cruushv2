"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "./utils";
import BugButtonSlot from "../BugButtonSlot";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn(
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[80] bg-black/50",
      className,
    )}
    {...props}
  />
));

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * Every menu is a full screen on mobile. A phone-sized pop-up leaves its
 * content cramped and scrolling inside a small box, so the sheet takes the
 * screen instead and returns to a centred dialog from the small breakpoint up.
 * `floating` opts out for the one menu that stays a pop-up on mobile, the
 * Pulse menu, which is dragged around the map on purpose.
 */
function DialogContent({
  className,
  children,
  floating = false,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { floating?: boolean; overlayClassName?: string }) {
  const framing = floating
    ? "fixed top-[50%] left-[50%] max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rounded-lg border sm:max-w-lg"
    : [
        "fixed inset-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0",
        "pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        "sm:inset-auto sm:top-[50%] sm:left-[50%] sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-lg",
        "sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:pt-6 sm:pb-6",
      ].join(" ");

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-dialog-framing={floating ? "floating" : "sheet"}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-[80] grid gap-4 overflow-x-hidden overflow-y-auto overscroll-contain p-6 shadow-lg duration-200",
          framing,
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close data-slot="dialog-close-x" className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute left-1 top-1 flex size-11 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, children, bugButton = true, ...props }: React.ComponentProps<"div"> & { bugButton?: boolean }) {
  const showBugButton = bugButton && !className?.split(/\s+/).includes("sr-only");
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", showBugButton && "cruush-dialog-bug-header", className)}
      {...props}
    >
      {children}
      {showBugButton ? <BugButtonSlot className="absolute right-3 top-3" testId="dialog-bug-button-slot" /> : null}
    </div>
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
