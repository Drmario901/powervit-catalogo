"use client";

import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import axios from "axios";
import { MessageCircle, ArrowUp, X, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChatContainer,
  ChatMessages,
  ChatForm,
  PromptSuggestions,
} from "@/components/ui/chat";
import { TypingIndicator } from "@/components/ui/typing-indicator";

/** Proxy interno: la URL real del asistente no se expone en el cliente. */
const API_URL = "/api/catalog-assistant";

interface CatalogAssistantProduct {
  id: number;
  nombre: string;
  precio_usd: number;
  venta_bcv: number;
  unidades: number;
  precio_bs?: number;
  estado?: string;
  en_oferta?: boolean;
  en_camino?: boolean;
  status?: "en existencia" | "agotado";
}

interface CatalogAssistantResponse {
  answer: string;
  source?: "database" | "ai" | "mixed";
  products?: CatalogAssistantProduct[];
  cached?: boolean;
  intent?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: CatalogAssistantProduct[];
}

const numFormatBs = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFormatUsd = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatBs(n: number): string {
  return `Bs ${numFormatBs.format(n)}`;
}

function formatUsd(n: number): string {
  return `$ ${numFormatUsd.format(n)}`;
}

function formatAssistantContent(text: string): string {
  if (!text) return "";
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  let out = escape(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/^\s*\*\s*/gm, "• ");
  out = out.replace(/\n/g, "<br />");
  return out;
}

function getMessageIntroWhenHasProducts(content: string): string {
  if (!content) return "";
  const lines = content.split(/\r?\n/);
  const introLines: string[] = [];
  for (const line of lines) {
    if (/^\s*[•*]\s+/.test(line.trim())) break;
    introLines.push(line);
  }
  let intro = introLines.join("\n").trim();
  if (intro.endsWith("Opciones:") || intro.endsWith("Opciones")) {
    intro = intro.replace(/\n?Opciones:?\s*$/i, "").trim();
  }
  return intro || content;
}

const SUGGESTIONS = [
  "Disponibilidad de productos",
  "¿Qué me recomiendas?",
  "¿Tienen creatinas disponibles?",
];

/** Producto que devuelve el API del chat; se usa para añadir al carrito si no está en la página actual. */
export interface ChatProductFromApi {
  id: number;
  nombre: string;
  venta_bcv: number;
  precio_bs?: number;
  status?: "en existencia" | "agotado";
  en_oferta?: boolean;
  en_camino?: boolean;
}

export interface ChatbotPopupProps {
  onOpenProduct?: (id: number, nombre: string, productFromChat?: ChatProductFromApi) => void;
  /** (id, nombre, productFromChat?) — si se pasa productFromChat y el producto no está en catálogo/ofertas, se usa para añadir igual */
  onAddToCart?: (id: number, nombre: string, productFromChat?: ChatProductFromApi) => void;
  /** IDs de productos que ya están en el carrito (para mostrar "En el carrito" y permitir quitar) */
  cartItemIds?: number[];
  /** Llamar justo antes de history.back() al cerrar el chat para que el catálogo no haga refetch ni scroll al inicio */
  onChatHistoryBack?: () => void;
  /** Al abrir el chat: cancelar debounce de búsqueda pendiente (evita scroll al top al cerrar el chat). */
  onChatOpen?: () => void;
  /** Oculta el FAB mientras el visor de producto está abierto (evita solaparse con el modal; el chat se abre desde el propio visor). */
  suppressFab?: boolean;
}

export interface ChatbotPopupHandle {
  /** Abre el chat y envía un mensaje (p. ej. desde el visor de un producto) */
  openAndSendMessage: (text: string) => void;
}

const CHAT_HINT_MESSAGES = [
  "Consulta tus dudas aquí",
  "¿En qué podemos ayudarte?",
  "Pregunta por disponibilidad",
];

const CHAT_PANEL_EXIT_MS = 220;

const ChatbotPopup = forwardRef<ChatbotPopupHandle, ChatbotPopupProps>(function ChatbotPopup(
  { onOpenProduct, onAddToCart, cartItemIds = [], onChatHistoryBack, onChatOpen, suppressFab = false },
  ref
) {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHintVisible, setChatHintVisible] = useState(true);
  const chatHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProductIdsRef = useRef<number[]>([]);
  const lastQuestionRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const didPushStateRef = useRef(false);
  /** Scroll del documento antes de abrir el chat (history.back puede restaurar scroll 0). */
  const catalogScrollYRef = useRef(0);

  useEffect(() => {
    if (!chatHintVisible) return;
    chatHintTimeoutRef.current = setTimeout(() => setChatHintVisible(false), 8000);
    return () => {
      if (chatHintTimeoutRef.current) {
        clearTimeout(chatHintTimeoutRef.current);
        chatHintTimeoutRef.current = null;
      }
    };
  }, [chatHintVisible]);

  const scrollChatToBottom = (smooth = false) => {
    requestAnimationFrame(() => {
      const el = messagesScrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  };

  useEffect(() => {
    if (open && messages.length > 0) scrollChatToBottom(true);
  }, [open, messages]);

  useEffect(() => {
    if (!open) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    if (!isMobile) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && !isClosing) {
      const t = requestAnimationFrame(() => setPanelVisible(true));
      return () => cancelAnimationFrame(t);
    }
    if (!open) setPanelVisible(false);
  }, [open, isClosing]);

  useEffect(() => {
    const shouldLock = open || isClosing;
    if (!shouldLock) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, isClosing]);

  // Al abrir el popup, añadir una entrada al historial para que "atrás" cierre el popup
  useEffect(() => {
    if (!open || isClosing) return;
    onChatOpen?.();
    catalogScrollYRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    didPushStateRef.current = true;
    history.pushState({ chatOpen: true }, "", window.location.href);
    return () => {
      if (didPushStateRef.current) {
        didPushStateRef.current = false;
      }
    };
  }, [open, isClosing, onChatOpen]);

  const restoreCatalogScrollPosition = () => {
    const y = catalogScrollYRef.current;
    const apply = () => window.scrollTo({ top: y, left: 0, behavior: "auto" });
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  };

  // Atrás del navegador: cerrar chat y avisar al catálogo (capture = antes que el listener del catálogo)
  useEffect(() => {
    const onPopState = () => {
      if (!open) return;
      onChatHistoryBack?.();
      didPushStateRef.current = false;
      setPanelVisible(false);
      setIsClosing(true);
      restoreCatalogScrollPosition();
    };
    window.addEventListener("popstate", onPopState, true);
    return () => window.removeEventListener("popstate", onPopState, true);
  }, [open, onChatHistoryBack]);

  useEffect(() => {
    if (!isClosing) return;
    closeTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      setPanelVisible(false);
      closeTimeoutRef.current = null;
    }, CHAT_PANEL_EXIT_MS);
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [isClosing]);

  const sendMessageRef = useRef<(text: string) => void>(() => {});

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      type Context = { last_product_ids?: number[]; last_question?: string };
      const body: { message: string; context?: Context } = { message: trimmed };
      const hasProducts = lastProductIdsRef.current.length > 0;
      const hasLastQuestion = lastQuestionRef.current != null && lastQuestionRef.current.trim() !== "";
      if (hasProducts || hasLastQuestion) {
        body.context = {};
        if (hasProducts) body.context.last_product_ids = lastProductIdsRef.current;
        if (hasLastQuestion) body.context.last_question = lastQuestionRef.current!;
      }
      lastQuestionRef.current = trimmed;

      const response = await axios.post<CatalogAssistantResponse>(API_URL, body, {
        headers: { "Content-Type": "application/json" },
      });
      const data = response?.data;
      if (data?.products && data.products.length > 0) {
        lastProductIdsRef.current = data.products.map((p) => p.id);
      }
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data?.answer != null && data.answer !== "" ? data.answer : "No pude obtener una respuesta.",
        products: data?.products,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setLoading(false);
      setTimeout(() => scrollChatToBottom(true), 120);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: "No pude conectar con el asistente. Intenta de nuevo en un momento.",
        },
      ]);
      setLoading(false);
      setTimeout(() => scrollChatToBottom(true), 120);
    }
  };

  sendMessageRef.current = sendMessage;

  useImperativeHandle(ref, () => ({
    openAndSendMessage(text: string) {
      const msg = text.trim();
      if (!msg) return;
      setOpen(true);
      setIsClosing(false);
      requestAnimationFrame(() => {
        setPanelVisible(true);
        setTimeout(() => sendMessageRef.current(msg), 120);
      });
    },
  }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleOpenChat = () => {
    setChatHintVisible(false);
    if (chatHintTimeoutRef.current) {
      clearTimeout(chatHintTimeoutRef.current);
      chatHintTimeoutRef.current = null;
    }
    if (open) {
      handleClosePanel();
      return;
    }
    setOpen(true);
    setIsClosing(false);
  };

  const handleClosePanel = () => {
    onChatHistoryBack?.();
    if (didPushStateRef.current) {
      didPushStateRef.current = false;
      history.back();
      restoreCatalogScrollPosition();
    }
    setPanelVisible(false);
    setIsClosing(true);
  };

  const [hintMessage] = useState(CHAT_HINT_MESSAGES[0]);

  const hideFab = suppressFab && !open;

  return (
    <>
      <div
        className={cn(
          "chat-fab-wrapper fixed left-3 bottom-5 z-[50] flex flex-row items-center gap-2 sm:left-6 sm:bottom-6",
          hideFab && "pointer-events-none invisible"
        )}
        aria-hidden={hideFab}
        suppressHydrationWarning
      >
        <button
          type="button"
          onClick={handleOpenChat}
          className={cn(
            "chat-assistant-fab relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg ring-2 ring-white/10 ring-offset-2 ring-offset-[var(--page-bg)] transition duration-300 hover:scale-[1.06] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 active:scale-[0.96] sm:h-14 sm:w-14 md:h-16 md:w-16",
            chatHintVisible && "chat-fab-attention"
          )}
          style={{ backgroundColor: "var(--color-brand-green)", color: "var(--color-on-brand)" }}
          aria-label={open ? "Cerrar chat" : "Abrir asistente del catálogo"}
        >
          {open ? (
            <X className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
          ) : (
            <MessageCircle className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8" strokeWidth={2} />
          )}
        </button>
        {chatHintVisible && !open && (
          <div
            role="status"
            aria-live="polite"
            className="chat-fab-hint animate-chat-fab-hint-in max-w-[13rem] rounded-2xl border px-3 py-2.5 shadow-xl backdrop-blur-sm sm:max-w-[15rem] sm:px-4 sm:py-3"
            style={{
              backgroundColor: "var(--card-bg)",
              borderColor: "var(--color-brand-green)",
              color: "var(--text-primary)",
              boxShadow: "0 12px 40px rgb(0 0 0 / 0.2)",
            }}
            suppressHydrationWarning
          >
            <p className="text-sm font-semibold sm:text-base">{hintMessage}</p>
            <p className="mt-0.5 text-xs leading-snug sm:text-sm" style={{ color: "var(--text-secondary)" }}>
              Toca para hablar con el asistente
            </p>
          </div>
        )}
      </div>

      {(open || isClosing) && (
        <>
          <button
            type="button"
            aria-label="Cerrar chat"
            className={cn(
              "chat-overlay fixed inset-0 z-[50]",
              panelVisible && !isClosing && "chat-overlay-visible",
              isClosing && "chat-overlay-closing"
            )}
            onClick={handleClosePanel}
          />
          <div
            className={cn(
              "chat-panel chat-assistant-panel fixed z-[50] flex w-full flex-col overflow-hidden",
              "inset-x-0 bottom-0 top-auto max-h-[85dvh] min-h-[320px] rounded-t-[1.25rem] border-x-0 border-t border-b-0 sm:inset-auto sm:left-6 sm:right-auto sm:bottom-24 sm:top-auto sm:h-[min(calc(100dvh-7rem),560px)] sm:max-w-[420px] sm:rounded-3xl sm:border",
              panelVisible && !isClosing && "chat-panel-visible",
              isClosing && "chat-panel-closing"
            )}
            style={{
              paddingBottom: "env(safe-area-inset-bottom)",
              borderColor: "var(--card-border)",
              backgroundColor: "var(--card-bg)",
              boxShadow: "0 -8px 40px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(255 255 255 / 0.06)",
            }}
          >
            <ChatContainer className="chat-assistant-shell flex h-full flex-col border-0 bg-transparent shadow-none ring-0">
              <header
                className="chat-assistant-header relative flex shrink-0 items-center justify-between gap-3 overflow-hidden px-3 py-3 sm:px-4 sm:py-3.5"
                style={{
                  borderBottom: "1px solid var(--card-border)",
                  background:
                    "linear-gradient(135deg, rgb(22 163 74 / 0.12) 0%, transparent 55%), var(--card-bg)",
                }}
              >
                <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-[var(--color-brand-green)] opacity-[0.07] blur-2xl" aria-hidden />
                <div className="relative flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-md sm:h-12 sm:w-12"
                    style={{
                      backgroundColor: "var(--color-brand-green)",
                      color: "var(--color-on-brand)",
                      boxShadow: "0 4px 14px rgb(22 163 74 / 0.35)",
                    }}
                  >
                    <Bot className="h-6 w-6 sm:h-6 sm:w-6" strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-[0.9375rem] font-semibold leading-tight tracking-tight sm:text-base" style={{ color: "var(--chat-foreground)" }}>
                      Asistente PowerVit
                    </h2>
                    <p className="mt-0.5 truncate text-[11px] leading-snug sm:text-xs" style={{ color: "var(--chat-muted-foreground)" }}>
                      Disponibilidad y precios
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClosePanel}
                  className="relative rounded-xl p-2 transition-colors hover:bg-[var(--chat-muted-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)]"
                  style={{ color: "var(--chat-muted-foreground)" }}
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ChatMessages ref={messagesScrollRef}>
                {messages.length === 0 && (
                  <PromptSuggestions
                    label="Escribe tu pregunta o elige una:"
                    suggestions={SUGGESTIONS}
                    onSelect={sendMessage}
                  />
                )}
                {messages.map((m, idx) => (
                  <div
                    key={m.id}
                    className={cn(
                      "mb-3 flex",
                      m.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "chat-message-bubble group/message relative max-w-[90%] break-words px-3.5 py-2.5 text-[0.8125rem] leading-relaxed shadow-sm sm:max-w-[78%] sm:px-4 sm:py-3 sm:text-sm",
                        m.role === "user"
                          ? "rounded-2xl rounded-br-md bg-[var(--color-brand-green)] text-white shadow-md"
                          : "chat-bubble-assistant rounded-2xl rounded-bl-md border shadow-sm",
                        m.role === "assistant" && "border-[var(--chat-border)]"
                      )}
                    >
                      {m.role === "user" ? (
                        <p className="whitespace-pre-wrap leading-snug">{m.content}</p>
                      ) : (
                        <>
                          <div
                            className={cn(
                              "whitespace-pre-wrap leading-snug",
                              m.products &&
                                m.products.length > 0 &&
                                "border-b pb-3 mb-3"
                            )}
                            style={{
                              ...(m.products && m.products.length > 0
                                ? { borderColor: "var(--card-border)" }
                                : {}),
                            }}
                            dangerouslySetInnerHTML={{
                              __html: formatAssistantContent(
                                m.products && m.products.length > 0
                                  ? getMessageIntroWhenHasProducts(m.content)
                                  : m.content
                              ),
                            }}
                          />
                          {m.products && m.products.length > 0 && (
                            <p
                              className="mb-2 text-xs font-medium"
                              style={{ color: "var(--chat-muted-foreground)" }}
                            >
                              Opciones
                            </p>
                          )}
                        </>
                      )}
                      {m.products && m.products.length > 0 && (
                        <div className="space-y-2">
                          {m.products.map((p) => {
                            const agotado =
                              p.status === "agotado" ||
                              p.estado === "agotado" ||
                              p.unidades === 0;
                            const enCamino = p.en_camino === true;
                            const enCarrito = cartItemIds.includes(p.id);
                            const puedeAgregar =
                              onAddToCart &&
                              p.unidades > 0 &&
                              !agotado &&
                              !enCamino;
                            const mostrarBotonCarrito = puedeAgregar || enCarrito;
                            return (
                              <div
                                key={p.id}
                                className="rounded-lg border px-3 py-2.5 transition-colors hover:border-[var(--chat-border)]"
                                style={{
                                  borderColor: "var(--chat-border)",
                                  backgroundColor: "var(--card-bg)",
                                }}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <p
                                    className="min-w-0 flex-1 text-sm font-medium leading-tight"
                                    style={{ color: "var(--chat-foreground)" }}
                                  >
                                    {p.nombre}
                                  </p>
                                  {p.en_oferta && (
                                    <span
                                      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm"
                                      style={{
                                        backgroundColor: "var(--color-badge-accent-bg)",
                                        color: "var(--color-badge-accent-text)",
                                        border: "1px solid var(--color-badge-accent-border)",
                                      }}
                                    >
                                      Oferta
                                    </span>
                                  )}
                                </div>
                                <p
                                  className="mt-1 text-xs leading-tight"
                                  style={{ color: "var(--chat-muted-foreground)" }}
                                >
                                  {formatUsd(p.venta_bcv ?? p.precio_usd ?? 0)} (BCV) · {formatBs(p.precio_bs ?? 0)}
                                  {enCamino && " · En camino"}
                                  {agotado && !enCamino && " · Agotado"}
                                </p>
                                {(onOpenProduct || onAddToCart) && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {onOpenProduct && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleClosePanel();
                                          requestAnimationFrame(() => {
                                            onOpenProduct(p.id, p.nombre, p);
                                          });
                                        }}
                                        className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium transition-colors hover:bg-[var(--input-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)]"
                                        style={{
                                          borderColor: "var(--color-brand-green)",
                                          color: "var(--color-brand-green)",
                                        }}
                                      >
                                        Ver en catálogo
                                      </button>
                                    )}
                                    {mostrarBotonCarrito && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onAddToCart?.(p.id, p.nombre, p);
                                          handleClosePanel();
                                        }}
                                        className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] disabled:opacity-50"
                                        style={{
                                          backgroundColor:
                                            "var(--color-brand-green)",
                                          color: "var(--color-on-brand)",
                                        }}
                                      >
                                        {enCarrito ? "En el carrito" : "Añadir al carrito"}
                                      </button>
                                    )}
                                    {enCamino && (
                                      <span
                                        className="text-xs"
                                        style={{
                                          color: "var(--chat-muted-foreground)",
                                        }}
                                      >
                                        Próximamente
                                      </span>
                                    )}
                                    {agotado && !enCamino && (
                                      <span
                                        className="text-xs"
                                        style={{
                                          color: "var(--chat-muted-foreground)",
                                        }}
                                      >
                                        No disponible
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="mb-3 flex justify-start">
                    <TypingIndicator />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </ChatMessages>

              <ChatForm onSubmit={handleSubmit} className="border-t bg-[var(--card-bg)]/95 p-3 backdrop-blur-sm sm:p-3.5">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Escribe tu mensaje..."
                    className="min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm outline-none transition-all placeholder:opacity-60 focus:border-[var(--color-brand-green)] focus:ring-2 focus:ring-[var(--color-brand-green)]/25 focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--chat-muted-bg)",
                      borderColor: "var(--chat-border)",
                      color: "var(--chat-foreground)",
                    }}
                    disabled={loading}
                    aria-label="Mensaje"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-lg transition-all hover:scale-105 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] active:scale-95 disabled:opacity-40"
                    style={{
                      backgroundColor: "var(--color-brand-green)",
                      color: "var(--color-on-brand)",
                    }}
                    aria-label="Enviar"
                  >
                    <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>
              </ChatForm>
            </div>
          </ChatContainer>
        </div>
        </>
      )}
    </>
  );
});

export default ChatbotPopup;
