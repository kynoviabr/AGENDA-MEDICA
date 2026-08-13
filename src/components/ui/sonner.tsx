import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Stripe-style toaster. Bottom-right, soft shadow, subtle entrance.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      offset={24}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-card group-[.toaster]:shadow-stripe-lg group-[.toaster]:px-4 group-[.toaster]:py-3",
          description: "group-[.toast]:text-[hsl(var(--text-secondary))]",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-btn",
          cancelButton: "group-[.toast]:bg-bg-subtle group-[.toast]:text-[hsl(var(--text-secondary))] group-[.toast]:rounded-btn",
          success: "group-[.toaster]:!border-[hsl(var(--success)/0.2)]",
          error: "group-[.toaster]:!border-[hsl(var(--destructive)/0.2)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
