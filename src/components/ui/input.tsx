import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, helperText, id, label, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const descriptionId = error || helperText ? `${inputId}-description` : undefined;

    return (
      <div className="grid gap-2">
        <label className="text-sm font-semibold text-ink" htmlFor={inputId}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-describedby={descriptionId}
          aria-invalid={Boolean(error)}
          className={cn(
            "h-11 rounded-xl border bg-white px-3.5 text-sm text-ink outline-none transition",
            "placeholder:text-ink-faint focus:border-forest focus:ring-3 focus:ring-forest/10",
            error ? "border-danger" : "border-line",
            className,
          )}
          {...props}
        />
        {(error || helperText) && (
          <p
            id={descriptionId}
            className={cn("text-sm", error ? "text-danger" : "text-ink-muted")}
          >
            {error ?? helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

