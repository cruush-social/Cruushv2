"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const { className, style, ...toasterProps } = props;

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={`toaster group ${className ?? ""}`.trim()}
      style={
        {
          ...style,
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "#C8FF31",
          "--success-bg": "var(--popover)",
          "--success-text": "var(--popover-foreground)",
          "--success-border": "#C8FF31",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "#C8FF31",
          "--warning-bg": "var(--popover)",
          "--warning-text": "var(--popover-foreground)",
          "--warning-border": "#C8FF31",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--popover-foreground)",
          "--error-border": "#C8FF31",
        } as React.CSSProperties
      }
      {...toasterProps}
    />
  );
};

export { Toaster };
