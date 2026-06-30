import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // Bottom-right keeps toasts out of the main workflow (sidebar is left,
      // content is center). closeButton puts an X on every toast; visibleToasts
      // caps the stack at 3 and expand={false} stops the stack from ballooning
      // on hover. Default duration (4s) covers success/info — per-type durations
      // for warnings/errors come from `@/lib/notify`.
      position="bottom-right"
      closeButton
      visibleToasts={3}
      expand={false}
      duration={4000}
      gap={8}
      offset={16}
      toastOptions={{
        // NOTE: do NOT add a literal `toast` class here — it collides with the
        // legacy `.toast { position: fixed }` rule and breaks Sonner positioning
        // (toasts pile up and can't be dismissed).
        classNames: {
          toast:
            "group pointer-events-auto flex w-full items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-lg",
          title: "text-sm font-medium leading-snug",
          description: "group-[.toast]:text-muted-foreground text-xs leading-snug",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground rounded-md px-2 py-1 text-xs font-medium",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground rounded-md px-2 py-1 text-xs",
          closeButton:
            "group-[.toast]:bg-background group-[.toast]:text-foreground group-[.toast]:border-border",
        },
        style: { width: "340px" },
      }}
      {...props}
    />
  );
};

export { Toaster };
