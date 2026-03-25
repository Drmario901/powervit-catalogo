"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Indicador de escritura — tres puntos animados (estilo [shadcn-chatbot-kit](https://shadcn-chatbot-kit.vercel.app/docs/components/typing-indicator)).
 */
export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex max-w-[70%] items-center gap-1 rounded-lg px-4 py-3 shadow-sm sm:max-w-[70%]",
        className
      )}
      style={{
        backgroundColor: "var(--chat-muted-bg)",
        border: "1px solid var(--chat-border)",
      }}
      aria-live="polite"
      aria-label="Escribiendo"
    >
      <span
        className="chat-typing-dot h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--chat-muted-foreground)" }}
      />
      <span
        className="chat-typing-dot h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--chat-muted-foreground)" }}
      />
      <span
        className="chat-typing-dot h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--chat-muted-foreground)" }}
      />
    </div>
  );
}
