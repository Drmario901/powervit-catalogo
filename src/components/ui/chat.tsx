"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Contenedor del chat — estilo [shadcn-chatbot-kit](https://shadcn-chatbot-kit.vercel.app/docs/components/chat).
 * Panel con flex column, bordes redondeados y tema del proyecto.
 */
export const ChatContainer = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col overflow-hidden rounded-xl border",
      className
    )}
    style={{
      backgroundColor: "var(--card-bg)",
      borderColor: "var(--card-border)",
    }}
    {...props}
  />
));
ChatContainer.displayName = "ChatContainer";

/**
 * Área de mensajes con scroll — equivalente a ChatMessages del kit.
 */
export const ChatMessages = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function ChatMessages({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("scrollbar-modern flex-1 overflow-y-auto overflow-x-hidden p-3 pb-6 sm:p-4 sm:pb-8", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ChatMessages.displayName = "ChatMessages";

/**
 * Formulario del chat (input + enviar) — equivalente a ChatForm del kit.
 */
export const ChatForm = forwardRef<
  HTMLFormElement,
  React.FormHTMLAttributes<HTMLFormElement>
>(({ className, ...props }, ref) => (
  <form
    ref={ref}
    className={cn("shrink-0 border-t p-2.5 sm:p-3", className)}
    style={{ borderColor: "var(--card-border)" }}
    {...props}
  />
));
ChatForm.displayName = "ChatForm";

interface PromptSuggestionsProps {
  label: string;
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  className?: string;
}

/**
 * Sugerencias de prompts — estilo [PromptSuggestions del kit](https://shadcn-chatbot-kit.vercel.app/docs/components/chat).
 * Muestra un label y una lista de botones (rounded-xl border bg-background hover:bg-muted).
 */
export function PromptSuggestions({
  label,
  suggestions,
  onSelect,
  className,
}: PromptSuggestionsProps) {
  return (
    <div className={cn("space-y-3 py-1", className)}>
      <p
        className="text-sm"
        style={{ color: "var(--chat-muted-foreground)" }}
      >
        {label}
      </p>
      <div className="grid gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSelect(suggestion)}
            className="chat-suggestion-chip group h-max w-full rounded-xl border px-3 py-3 text-left text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] active:scale-[0.99] sm:px-4"
            style={{
              borderColor: "var(--chat-border)",
              backgroundColor: "var(--chat-muted-bg)",
              color: "var(--chat-foreground)",
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
