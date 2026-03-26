"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { RespuestaCatalogo, ProductoCatalogo } from "../types/catalogo";
import { WHATSAPP_NUMBER, MAIN_SITE_URL, SITE_NAME } from "../config/site";
import ofertasStyles from "./OfertasSection.module.css";
import ChatbotPopup, { type ChatbotPopupHandle, type ChatProductFromApi } from "./ChatbotPopup";

const LOGO_URL = "/logo.png";
const THEME_KEY = "powervit-catalog-theme";
const PER_PAGE = 12;
type Theme = "light" | "dark";

interface CatalogProps {
  data: RespuestaCatalogo;
  initialSearch?: string;
  /** Ofertas cargadas en SSR para evitar skeleton en primera pintura */
  initialOfertas?: ProductoCatalogo[];
  /** Tasa BCV de la API de ofertas (opcional, se usa debajo de "Productos en oferta") */
  initialTasaBcv?: number | null;
}

interface ImageViewerState {
  url: string;
  alt: string;
  productName?: string;
  priceBs?: string;
  priceBcv?: string;
  status?: "en existencia" | "agotado";
  product?: ProductoCatalogo;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function formatBs(n: number | null): string {
  if (n == null) return "Tasa no disponible";
  return `Bs ${new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

function formatBcv(n: number) {
  return `REF. ${n.toFixed(2)}`;
}

/**
 * Parsea cantidad escrita por el usuario: acepta miles (20.000, 20,000) y decimales (12,5 o 12.5).
 * Devuelve null si no es un número válido.
 */
function parseDecimalInput(str: string): number | null {
  const s = str.trim().replace(/\s/g, "");
  if (s === "") return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const normalized = s
      .replace(new RegExp(`\\${decimalSep === "," ? "." : ","}`, "g"), "")
      .replace(decimalSep, ".");
    const n = parseFloat(normalized);
    return Number.isNaN(n) ? null : n;
  }
  if (hasComma) {
    const after = s.split(",")[1] ?? "";
    if (after.length === 3 && /^\d+$/.test(after)) {
      const n = parseFloat(s.replace(",", ""));
      return Number.isNaN(n) ? null : n;
    }
    const n = parseFloat(s.replace(",", "."));
    return Number.isNaN(n) ? null : n;
  }
  if (hasDot) {
    const after = s.split(".")[1] ?? "";
    if (after.length === 3 && /^\d+$/.test(after)) {
      const n = parseFloat(s.replace(".", ""));
      return Number.isNaN(n) ? null : n;
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** Mensaje único para enviar toda la consulta por WhatsApp */
function buildWhatsAppUrlFromConsulta(items: ProductoCatalogo[]): string {
  const lines = [
    "Hola, buen día.",
    "",
    "Me interesa obtener más información sobre los siguientes productos del catálogo:",
    "",
    ...items.map((item, i) => {
      const precio = formatBs(item.venta_bs);
      const bcv = formatBcv(item.venta_bcv);
      return `${i + 1}. ${item.producto}\n   ${precio} · ${bcv}`;
    }),
    "",
    "¿Podrían indicarme disponibilidad y formas de pago? Gracias.",
  ];
  const text = lines.join("\n");
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CartIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function MessageCircleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function TruckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.375 4.5C2.339 4.5 1.5 5.34 1.5 6.375V13.5h12V6.375c0-1.036-.84-1.875-1.875-1.875zM13.5 15h-12v2.625c0 1.035.84 1.875 1.875 1.875h.375a3 3 0 116 0h3a.75.75 0 00.75-.75z" />
      <path d="M8.25 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0zm7.5-12.75a.75.75 0 00-.75.75v11.25c0 .087.015.17.042.248a3 3 0 015.958.464c.853-.175 1.522-.935 1.464-1.883a18.659 18.659 0 00-3.732-10.104 1.837 1.837 0 00-1.47-.725z" />
      <path d="M19.5 19.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" />
    </svg>
  );
}

function ThemeIcon({ theme }: { theme: Theme }) {
  return theme === "light" ? (
    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ) : (
    <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

async function fetchCatalogoFromServer(
  page: number,
  perPage: number,
  search: string
): Promise<RespuestaCatalogo> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  if (search.trim()) params.set("search", search.trim());
  const res = await fetch(`/api/catalogo?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Error al cargar el catálogo");
  return res.json();
}

export default function Catalog({ data: initialData, initialSearch, initialOfertas, initialTasaBcv }: CatalogProps) {
  const [data, setData] = useState<RespuestaCatalogo>(initialData);
  const [query, setQuery] = useState(initialSearch ?? initialData.search ?? "");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [viewer, setViewer] = useState<ImageViewerState | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerClosing, setViewerClosing] = useState(false);
  const [consultaItems, setConsultaItems] = useState<ProductoCatalogo[]>([]);
  const [consultaPanelOpen, setConsultaPanelOpen] = useState(false);
  const [consultaPopupVisible, setConsultaPopupVisible] = useState(false);
  const [tasaSheetOpen, setTasaSheetOpen] = useState(false);
  const [tasaSheetVisible, setTasaSheetVisible] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [isSheetClosing, setIsSheetClosing] = useState(false);
  const sheetDragStartYRef = useRef(0);
  const sheetDraggingRef = useRef(false);
  const sheetDragYRef = useRef(0);
  const tasaSheetPanelRef = useRef<HTMLDivElement | null>(null);
  const tasaSheetCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasaSheetHistoryPushedRef = useRef(false);
  const [calcUsdInput, setCalcUsdInput] = useState("");
  const [calcBsInput, setCalcBsInput] = useState("");
  const [cartFabBounce, setCartFabBounce] = useState(false);
  const cartFabBounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cartToast, setCartToast] = useState("");
  const cartToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [whatsappPreparing, setWhatsappPreparing] = useState(false);
  const [ofertasProductos, setOfertasProductos] = useState<ProductoCatalogo[]>(initialOfertas ?? []);
  const [ofertasLoading, setOfertasLoading] = useState(!initialOfertas);
  const [ofertaTasaBcv, setOfertaTasaBcv] = useState<number | null>(initialTasaBcv ?? null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<string>("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popstateFromClosingViewerRef = useRef(false);
  const skipFirstThemeApplyRef = useRef(true);
  const catalogTopRef = useRef<HTMLElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const viewerImageContainerRef = useRef<HTMLDivElement | null>(null);
  const viewerScrollYRef = useRef(0);
  const chatPopupRef = useRef<ChatbotPopupHandle | null>(null);
  /** Siempre igual a `query` — el listener de popstate no puede depender de `query` en el efecto sin ref (closure obsoleto → cerrar chat disparaba scroll al top). */
  const catalogQueryRef = useRef(query);
  catalogQueryRef.current = query;

  const productos = data.productos ?? [];
  const paginationRaw = data.pagination;
  const pagination = paginationRaw ?? {
    current_page: 1,
    last_page: 1,
    per_page: PER_PAGE,
    total: productos.length,
    from: productos.length ? 1 : null,
    to: productos.length > 0 ? productos.length : null,
    first_page_url: "",
    last_page_url: "",
    next_page_url: null,
    prev_page_url: null,
  };
  const currentPage = pagination.current_page;
  const totalPages = Math.max(1, pagination.last_page);
  const from = pagination.from ?? 0;
  const to = pagination.to ?? 0;
  const total = pagination.total;

  const toggleVoiceSearch = useCallback(() => {
    const Win = typeof window !== "undefined" ? window : null;
    const WinWithRec = Win as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRecognitionAPI =
      Win && ("SpeechRecognition" in Win || "webkitSpeechRecognition" in Win)
        ? (WinWithRec.SpeechRecognition ?? WinWithRec.webkitSpeechRecognition)
        : null;
    if (!SpeechRecognitionAPI) return;

    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    transcriptRef.current = "";
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "es-VE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (e: unknown) => {
      try {
        const ev = e as { results?: { length: number; [i: number]: { [j: number]: { transcript?: string } } } };
        const results = ev?.results;
        if (!results || results.length === 0) return;
        const last = results[results.length - 1];
        const first = last?.[0];
        const transcript = (first?.transcript ?? "").trim();
        if (transcript) {
          transcriptRef.current = transcript;
          setQuery(transcript);
        }
      } catch {
        /* noop */
      }
    };
    recognition.onend = () => {
      if (transcriptRef.current) setQuery(transcriptRef.current);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  useEffect(() => {
    const isLight = document.documentElement.classList.contains("theme-light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (skipFirstThemeApplyRef.current) {
      skipFirstThemeApplyRef.current = false;
      return;
    }
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(`theme-${theme}`);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  useEffect(() => {
    if (initialOfertas !== undefined) return;
    let cancelled = false;
    setOfertasLoading(true);
    fetch("/api/ofertas", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { productos: [], tasa_bcv: null }))
      .then((d: RespuestaCatalogo) => {
        if (!cancelled && Array.isArray(d.productos)) setOfertasProductos(d.productos);
        if (!cancelled && d.tasa_bcv != null) setOfertaTasaBcv(d.tasa_bcv);
      })
      .catch(() => {
        if (!cancelled) setOfertasProductos([]);
      })
      .finally(() => {
        if (!cancelled) setOfertasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialOfertas]);

  useEffect(() => {
    if (consultaPanelOpen) {
      setConsultaPopupVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setConsultaPopupVisible(true));
      });
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    } else {
      setConsultaPopupVisible(false);
    }
  }, [consultaPanelOpen]);

  useEffect(() => {
    if (consultaItems.length === 0 && consultaPanelOpen) {
      setConsultaPanelOpen(false);
    }
  }, [consultaItems.length, consultaPanelOpen]);

  useEffect(() => {
    if (!consultaPanelOpen) setWhatsappPreparing(false);
  }, [consultaPanelOpen]);

  useEffect(() => {
    if (tasaSheetOpen) {
      if (tasaSheetCloseTimeoutRef.current) {
        clearTimeout(tasaSheetCloseTimeoutRef.current);
        tasaSheetCloseTimeoutRef.current = null;
      }
      tasaSheetHistoryPushedRef.current = true;
      try {
        window.history.pushState({ tasaSheet: true }, "", window.location.href);
      } catch {
        tasaSheetHistoryPushedRef.current = false;
      }
      setSheetDragY(0);
      setIsSheetDragging(false);
      setIsSheetClosing(false);
      setTasaSheetVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setTasaSheetVisible(true));
      });
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    } else {
      setTasaSheetVisible(false);
    }
  }, [tasaSheetOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (tasaSheetHistoryPushedRef.current) {
        tasaSheetHistoryPushedRef.current = false;
        setTasaSheetOpen(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const closeTasaSheet = useCallback(() => {
    if (tasaSheetCloseTimeoutRef.current) {
      clearTimeout(tasaSheetCloseTimeoutRef.current);
      tasaSheetCloseTimeoutRef.current = null;
    }
    setIsSheetClosing(true);
    tasaSheetCloseTimeoutRef.current = setTimeout(() => {
      tasaSheetCloseTimeoutRef.current = null;
      setIsSheetClosing(false);
      if (tasaSheetHistoryPushedRef.current) {
        window.history.back();
      } else {
        setTasaSheetOpen(false);
      }
    }, 380);
  }, []);

  const CLOSE_THRESHOLD = 80;

  const handleSheetDragStart = useCallback((clientY: number) => {
    sheetDragStartYRef.current = clientY;
    sheetDraggingRef.current = true;
    setIsSheetDragging(true);
  }, []);

  const handleSheetDragMove = useCallback((clientY: number) => {
    if (!sheetDraggingRef.current) return;
    const dy = clientY - sheetDragStartYRef.current;
    const y = Math.max(0, dy);
    sheetDragYRef.current = y;
    setSheetDragY(y);
  }, []);

  const handleSheetDragEnd = useCallback(() => {
    if (!sheetDraggingRef.current) return;
    sheetDraggingRef.current = false;
    setIsSheetDragging(false);
    const currentY = sheetDragYRef.current;
    if (currentY > CLOSE_THRESHOLD) {
      setSheetDragY(0);
      sheetDragYRef.current = 0;
      setIsSheetClosing(true);
      if (tasaSheetCloseTimeoutRef.current) clearTimeout(tasaSheetCloseTimeoutRef.current);
      tasaSheetCloseTimeoutRef.current = setTimeout(() => {
        tasaSheetCloseTimeoutRef.current = null;
        setIsSheetClosing(false);
        if (tasaSheetHistoryPushedRef.current) {
          window.history.back();
        } else {
          setTasaSheetOpen(false);
        }
      }, 380);
      return;
    }
    setSheetDragY(0);
    sheetDragYRef.current = 0;
  }, []);

  useEffect(() => {
    if (!tasaSheetOpen) return;
    const onMove = (e: TouchEvent | MouseEvent) => {
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      handleSheetDragMove(clientY);
    };
    const onEnd = () => handleSheetDragEnd();
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    return () => {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
    };
  }, [tasaSheetOpen, handleSheetDragMove, handleSheetDragEnd]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  const isInConsulta = useCallback(
    (id: number) => consultaItems.some((item) => item.id === id),
    [consultaItems]
  );

  const toggleConsulta = useCallback((product: ProductoCatalogo) => {
    setConsultaItems((prev) => {
      const exists = prev.some((item) => item.id === product.id);
      if (exists) return prev.filter((item) => item.id !== product.id);
      return [...prev, product];
    });
    if (!isInConsulta(product.id)) {
      const isFirstAdd = consultaItems.length === 0;
      if (isFirstAdd) setConsultaPanelOpen(true);
      if (cartFabBounceTimeoutRef.current) clearTimeout(cartFabBounceTimeoutRef.current);
      setCartFabBounce(true);
      cartFabBounceTimeoutRef.current = setTimeout(() => {
        setCartFabBounce(false);
        cartFabBounceTimeoutRef.current = null;
      }, 600);
      if (cartToastTimeoutRef.current) clearTimeout(cartToastTimeoutRef.current);
      const count = consultaItems.length + 1;
      setCartToast(count === 1 ? "Añadido al carrito" : `${count} productos en el carrito`);
      cartToastTimeoutRef.current = setTimeout(() => {
        setCartToast("");
        cartToastTimeoutRef.current = null;
      }, 2500);
    }
  }, [isInConsulta, consultaItems.length]);

  const removeFromConsulta = useCallback((id: number) => {
    setConsultaItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const findProductById = useCallback(
    (id: number | string): ProductoCatalogo | null => {
      const normalizedId = Number(id);
      if (!Number.isFinite(normalizedId)) return null;
      const inCatalog = data.productos?.find((p) => Number(p.id) === normalizedId);
      if (inCatalog) return inCatalog;
      const inOfertas = ofertasProductos.find((p) => Number(p.id) === normalizedId);
      return inOfertas ?? null;
    },
    [data.productos, ofertasProductos]
  );

  const openViewer = useCallback(
    (
      url: string,
      alt: string,
      productName?: string,
      priceBs?: string,
      priceBcv?: string,
      status?: "en existencia" | "agotado",
      product?: ProductoCatalogo
    ) => {
      setViewerClosing(false);
      setViewer({ url, alt, productName, priceBs, priceBcv, status, product });
      setViewerVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setViewerVisible(true));
      });
      if (typeof window !== "undefined" && window.history) {
        window.history.pushState({ catalogViewer: true }, "", window.location.href);
      }
    },
    []
  );

  const closeViewer = useCallback(() => {
    setViewerClosing(true);
    setTimeout(() => {
      setViewer(null);
      setViewerClosing(false);
      setViewerVisible(false);
    }, 300);
  }, []);

  const closeViewerWithBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history) {
      popstateFromClosingViewerRef.current = true;
      window.history.back();
    } else {
      closeViewer();
    }
  }, [closeViewer]);

  useEffect(() => {
    if (!viewer) return;
    viewerScrollYRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewerWithBack();
    };
    const onPopState = () => closeViewer();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPopState);
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${viewerScrollYRef.current}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPopState);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, viewerScrollYRef.current);
    };
  }, [viewer, closeViewer, closeViewerWithBack]);

  useEffect(() => {
    return () => {
      if (cartFabBounceTimeoutRef.current) clearTimeout(cartFabBounceTimeoutRef.current);
      if (cartToastTimeoutRef.current) clearTimeout(cartToastTimeoutRef.current);
    };
  }, []);

  const fetchCatalog = useCallback(async (page: number, search: string, append = false) => {
    setLoading(true);
    try {
      const res = await fetchCatalogoFromServer(page, PER_PAGE, search);
      if (append) {
        setData((prev) => ({
          ...res,
          productos: [...(prev.productos ?? []), ...(res.productos ?? [])],
        }));
      } else {
        setData(res);
      }
    } catch {
      if (!append) setData((prev) => prev);
    } finally {
      setLoading(false);
    }
  }, []);

  const getCatalogStateFromUrl = useCallback(() => {
    if (typeof window === "undefined") return { page: 1, q: "" };
    const params = new URLSearchParams(window.location.search);
    const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
    const q = params.get("q") ?? params.get("search") ?? "";
    return { page, q };
  }, []);

  const updateCatalogUrl = useCallback((search: string, replace = false) => {
    if (typeof window === "undefined" || !window.history) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const searchStr = params.toString();
    const url = `${window.location.pathname}${searchStr ? `?${searchStr}` : ""}`;
    const state = { catalogQuery: search };
    if (replace) {
      window.history.replaceState(state, "", url);
    } else {
      window.history.pushState(state, "", url);
    }
  }, []);

  const scrollCatalogToTop = useCallback(() => {
    catalogTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /**
   * Si el usuario escribe en el buscador y abre el chat antes de que venza el debounce (400 ms),
   * el timer sigue vivo: al cerrar el chat dispara scrollCatalogToTop y sube la página.
   * Cancelamos el timer y sincronizamos URL/datos sin scroll (mismo criterio al abrir el chat).
   */
  const flushPendingSearchNoScroll = useCallback(() => {
    if (searchDebounceRef.current == null) return;
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = null;
    const q = catalogQueryRef.current;
    fetchCatalog(1, q);
    updateCatalogUrl(q, true);
  }, [fetchCatalog, updateCatalogUrl]);

  const openProductInViewer = useCallback(
    (product: ProductoCatalogo) => {
      openViewer(
        product.imagen_url || LOGO_URL,
        product.producto,
        product.producto,
        formatBs(product.venta_bs),
        formatBcv(product.venta_bcv),
        product.status,
        product
      );
    },
    [openViewer]
  );

  const handleChatOpenProduct = useCallback(
    async (id: number, nombre: string, productFromChat?: ChatProductFromApi) => {
      const p = findProductById(id);
      if (p) {
        openProductInViewer(p);
        return;
      }

      if (productFromChat) {
        try {
          // Producto sugerido por LLM puede no estar aún en la página actual (scroll infinito).
          // Hacemos fetch puntual por nombre y abrimos por ID para obtener imagen real.
          const remote = await fetchCatalogoFromServer(1, 80, productFromChat.nombre || nombre);
          const remoteProduct =
            remote.productos?.find((item) => Number(item.id) === Number(productFromChat.id)) ??
            remote.productos?.find((item) => item.producto.trim().toLowerCase() === (productFromChat.nombre || nombre).trim().toLowerCase());
          if (remoteProduct) {
            openProductInViewer(remoteProduct);
            return;
          }
        } catch {
          // Fallback abajo
        }

        const syntheticProduct: ProductoCatalogo = {
          id: Number(productFromChat.id),
          producto: productFromChat.nombre,
          venta_bcv: productFromChat.venta_bcv,
          venta_bs: productFromChat.precio_bs ?? null,
          status: productFromChat.status,
          en_oferta: productFromChat.en_oferta,
          en_camino: productFromChat.en_camino,
          imagen_url: LOGO_URL,
        };
        openProductInViewer(syntheticProduct);
        return;
      }

      setQuery(nombre);
      scrollCatalogToTop();
      fetchCatalog(1, nombre);
      updateCatalogUrl(nombre, true);
    },
    [findProductById, openProductInViewer, scrollCatalogToTop, fetchCatalog, updateCatalogUrl]
  );

  const handleChatAddToCart = useCallback(
    (id: number, _nombre: string, productFromChat?: ChatProductFromApi) => {
      let p: ProductoCatalogo | null = findProductById(id);
      if (!p && productFromChat) {
        if (productFromChat.status === "agotado" || productFromChat.en_camino) return;
        p = {
          id: productFromChat.id,
          producto: productFromChat.nombre,
          venta_bcv: productFromChat.venta_bcv,
          venta_bs: productFromChat.precio_bs ?? null,
          status: productFromChat.status,
          en_oferta: productFromChat.en_oferta,
          en_camino: productFromChat.en_camino,
          imagen_url: "",
        };
      }
      if (!p) return;
      if (p.status === "agotado" || p.en_camino) return;
      toggleConsulta(p);
    },
    [findProductById, toggleConsulta]
  );

  const loadNextPage = useCallback(() => {
    if (loading || currentPage >= totalPages || total === 0) return;
    fetchCatalog(currentPage + 1, query, true);
  }, [loading, currentPage, totalPages, total, query, fetchCatalog]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || total === 0 || currentPage >= totalPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextPage();
      },
      { rootMargin: "200px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentPage, totalPages, total, loadNextPage]);

  /** Evita que history.back() al cerrar el chat dispare refetch y scroll al inicio del catálogo */
  const skipCatalogPopstateForChatRef = useRef(false);

  const didInitHistoryRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.history || didInitHistoryRef.current) return;
    didInitHistoryRef.current = true;
    const { q } = getCatalogStateFromUrl();
    if (q) {
      setQuery(q);
      fetchCatalog(1, q);
      updateCatalogUrl(q, true);
    } else {
      window.history.replaceState({ catalogQuery: "" }, "", window.location.pathname);
    }
  }, [getCatalogStateFromUrl, fetchCatalog, updateCatalogUrl]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.history) return;
    const onPopState = (e: PopStateEvent) => {
      if (skipCatalogPopstateForChatRef.current) {
        skipCatalogPopstateForChatRef.current = false;
        return;
      }
      if (e.state?.catalogViewer) return;
      if (popstateFromClosingViewerRef.current) {
        popstateFromClosingViewerRef.current = false;
        return;
      }
      const state = e.state;
      const rawQ = state?.catalogQuery ?? getCatalogStateFromUrl().q ?? "";
      const q = rawQ.trim();
      // Cerrar el chat solo hace history.back() sin cambiar URL/búsqueda: no recargar ni subir al top.
      if (q === catalogQueryRef.current.trim()) {
        return;
      }
      setQuery(q);
      scrollCatalogToTop();
      fetchCatalog(1, q);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fetchCatalog, getCatalogStateFromUrl, scrollCatalogToTop]);

  const isFirstSearchRef = useRef(true);
  useEffect(() => {
    if (isFirstSearchRef.current) {
      isFirstSearchRef.current = false;
      return;
    }
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      scrollCatalogToTop();
      fetchCatalog(1, query);
      updateCatalogUrl(query, true);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [query, fetchCatalog, updateCatalogUrl, scrollCatalogToTop]);

  const searchBar = (
    <div className="relative flex min-h-[44px] min-w-0 flex-1 items-stretch" suppressHydrationWarning>
      <span
        className="pointer-events-none absolute left-3 top-1/2 z-[1] flex -translate-y-1/2 items-center justify-center"
        style={{ color: "var(--text-secondary)" }}
      >
        <SearchIcon />
      </span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar producto..."
        className={`w-full min-w-0 rounded-xl py-2 pl-10 text-sm outline-none transition focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-1 ${query ? "pr-[76px]" : "pr-11"}`}
        style={{
          backgroundColor: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--text-primary)",
        }}
        aria-label="Buscar en el catálogo"
      />
      <div className="absolute right-2 top-1/2 flex h-8 -translate-y-1/2 items-center gap-1" suppressHydrationWarning>
        <button
          type="button"
          onClick={toggleVoiceSearch}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:opacity-80 ${isListening ? "mic-listening" : ""}`}
          style={{
            color: isListening ? "var(--color-brand-green)" : "var(--text-secondary)",
            backgroundColor: isListening ? "rgba(22, 163, 74, 0.22)" : "transparent",
          }}
          aria-label={isListening ? "Detener micrófono" : "Buscar por voz"}
          title={isListening ? "Escuchando… Clic para parar" : "Buscar por voz"}
        >
          <MicIcon />
        </button>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Limpiar búsqueda"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen transition-colors duration-200" style={{ backgroundColor: "var(--page-bg)" }} suppressHydrationWarning>
      <header
        className="catalog-header sticky top-0 z-20 border-b shadow-sm backdrop-blur-sm"
        style={{ borderColor: "var(--card-border)", backgroundColor: "var(--header-bg)" }}
        suppressHydrationWarning
      >
        {/* suppressHydrationWarning: extensiones del navegador (ej. Bitwarden) pueden inyectar atributos como bis_skin_checked antes de la hidratación */}
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-4 lg:px-6" suppressHydrationWarning>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3" suppressHydrationWarning>
              <a
                href="/"
                className="flex shrink-0 items-center"
                onClick={(e) => {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-label="Ir al inicio"
              >
                <img
                  src={LOGO_URL}
                  alt={SITE_NAME}
                  width={160}
                  height={40}
                  loading="eager"
                  fetchPriority="high"
                  className="h-7 w-auto max-w-[120px] object-contain sm:h-8 sm:max-w-[140px] lg:h-9 lg:max-w-[160px]"
                  style={theme === "light" ? { filter: "brightness(0)" } : { filter: "brightness(0) invert(1)" }}
                />
              </a>
              <div className="hidden min-w-0 flex-1 lg:flex" suppressHydrationWarning>{searchBar}</div>
              <div className="flex-1 lg:hidden" suppressHydrationWarning />
              <div className="flex shrink-0 items-center gap-2" suppressHydrationWarning>
                {ofertaTasaBcv != null && (
                  <button
                    type="button"
                    onClick={() => setTasaSheetOpen(true)}
                    className="tasa-cta-focus flex h-10 shrink-0 items-center justify-between gap-2 rounded-xl px-3 text-left transition hover:opacity-90 sm:h-10 sm:gap-2.5 sm:px-4"
                    style={{
                      backgroundColor: "var(--color-brand-green)",
                      color: "var(--color-on-brand)",
                    }}
                    title="Abrir calculadora de tasa de cambio"
                  >
                    <div className="min-w-0 flex-1 text-left" suppressHydrationWarning>
                      <p className="text-[10px] font-medium leading-tight sm:text-xs" style={{ color: "var(--color-on-brand)" }}>
                        Tasa de cambio
                      </p>
                      <p className="mt-0.5 text-xs font-bold leading-tight sm:text-sm" style={{ color: "var(--color-on-brand)" }}>
                        Bs. {new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(ofertaTasaBcv)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-medium sm:text-base" style={{ color: "var(--color-on-brand)" }} aria-hidden>
                      &#8250;
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition hover:opacity-80"
                  style={{ backgroundColor: "var(--color-brand-ink)", border: "1px solid var(--card-border)" }}
                  aria-label={theme === "light" ? "Modo oscuro" : "Modo claro"}
                >
                  <ThemeIcon theme={theme} />
                </button>
              </div>
            </div>
            <div className="mt-3 lg:hidden" suppressHydrationWarning>{searchBar}</div>
        </div>
      </header>

      <main
        ref={catalogTopRef}
        className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6 lg:px-6 lg:py-8"
        style={{ paddingBottom: "2rem" }}
        suppressHydrationWarning
      >
        {/* Productos en oferta: solo cuando no hay búsqueda activa */}
        {!query.trim() && (ofertasLoading || ofertasProductos.length > 0) && (
          <section className={ofertasStyles.ofertasSection} aria-label="Productos en oferta" suppressHydrationWarning>
            <header className={ofertasStyles.ofertasHeader}>
              <h2 className={ofertasStyles.ofertasTitle}>Productos en oferta</h2>
              <p className={ofertasStyles.ofertasSubtitle}>Aprovecha antes de que se agoten</p>
              <hr className={ofertasStyles.ofertasSeparator} aria-hidden />
            </header>
            {ofertasLoading ? (
              <div className={ofertasStyles.ofertasSkeletonGrid}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={ofertasStyles.ofertasSkeletonCard}>
                    <div className={ofertasStyles.ofertasSkeletonImage} />
                    <div className={ofertasStyles.ofertasSkeletonBody}>
                      <div className={`${ofertasStyles.ofertasSkeletonLine} ${ofertasStyles.ofertasSkeletonLineTitle}`} />
                      <div className={`${ofertasStyles.ofertasSkeletonLine} ${ofertasStyles.ofertasSkeletonLinePrice}`} />
                      <div className={`${ofertasStyles.ofertasSkeletonLine} ${ofertasStyles.ofertasSkeletonLineBtn}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={ofertasStyles.ofertasGrid} suppressHydrationWarning>
                {ofertasProductos.map((p, index) => (
                  <article key={p.id} className={ofertasStyles.ofertasCard}>
                    <button
                      type="button"
                      onClick={() =>
                        openViewer(
                          p.imagen_url || "",
                          p.producto,
                          p.producto,
                          formatBs(p.venta_bs),
                          formatBcv(p.venta_bcv),
                          p.status,
                          p
                        )
                      }
                      className={ofertasStyles.ofertasCardImageWrap}
                      aria-label={`Ver ${p.producto}`}
                    >
                      <img
                        src={p.imagen_url || "/placeholder.svg"}
                        alt={p.producto}
                        loading={index < 3 ? "eager" : "lazy"}
                        decoding="async"
                        className={ofertasStyles.ofertasCardImg}
                        onError={(e) => {
                          const t = e.currentTarget;
                          t.onerror = null;
                          t.src =
                            "data:image/svg+xml," +
                            encodeURIComponent(
                              '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="%23334155" width="400" height="300"/><text x="50%" y="50%" fill="%2394a3b8" font-size="12" text-anchor="middle" dominant-baseline="middle">Sin imagen</text></svg>'
                            );
                        }}
                      />
                      <span className={ofertasStyles.ofertasBadge}>En oferta</span>
                    </button>
                    <div className={ofertasStyles.ofertasCardBody} suppressHydrationWarning>
                      <h3 className={ofertasStyles.ofertasCardTitle}>{p.producto}</h3>
                      <div className={ofertasStyles.ofertasPrices} suppressHydrationWarning>
                        <span
                          className={ofertasStyles.ofertasPriceDollar}
                          style={p.status === "agotado" ? { color: "var(--text-secondary)" } : undefined}
                        >
                          {formatBcv(p.venta_bcv)}
                        </span>
                        <span className={ofertasStyles.ofertasPriceEquiv}>
                          Equivalente a {formatBs(p.venta_bs)}
                        </span>
                      </div>
                      <div className={ofertasStyles.ofertasCtaWrap} suppressHydrationWarning>
                        {p.status === "agotado" ? (
                          <span
                            className={ofertasStyles.ofertasBtn}
                            style={{ border: "1px solid var(--input-border)", color: "var(--text-secondary)", backgroundColor: "transparent", cursor: "default" }}
                          >
                            Agotado
                          </span>
                        ) : p.en_camino ? (
                          <span
                            className={ofertasStyles.ofertasBtn}
                            style={{ border: "1px solid var(--color-brand-ink)", color: "var(--color-on-brand)", backgroundColor: "var(--color-brand-ink)", cursor: "default", flexDirection: "column", gap: "0.125rem" }}
                          >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                              <TruckIcon className="h-4 w-4 shrink-0" />
                              Vienen en camino
                            </span>
                            <span style={{ fontSize: "0.75rem" }}>nuevas unidades</span>
                          </span>
                        ) : isInConsulta(p.id) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openViewer(p.imagen_url || "", p.producto, p.producto, formatBs(p.venta_bs), formatBcv(p.venta_bcv), p.status, p);
                              setConsultaPanelOpen(false);
                            }}
                            className={`${ofertasStyles.ofertasBtn} ${ofertasStyles.ofertasBtnOutline}`}
                          >
                            <CheckIcon className="h-4 w-4 shrink-0" />
                            En carrito
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleConsulta(p);
                            }}
                            className={`${ofertasStyles.ofertasBtn} ${ofertasStyles.ofertasBtnPrimary}`}
                            aria-label="Añadir al carrito"
                          >
                            <CartIcon className="h-4 w-4 shrink-0" />
                            Añadir al carrito
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <h1 className="mb-4 text-2xl font-semibold sm:mb-5 sm:text-3xl lg:text-4xl" style={{ color: "var(--text-primary)" }}>
          Catálogo de Productos
        </h1>

        {loading && productos.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:gap-5 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <article
                key={i}
                className="flex flex-row overflow-hidden rounded-2xl border sm:flex-col"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)" }}
              >
                <div
                  className="h-full min-h-[120px] w-[38%] min-w-[120px] max-w-[160px] shrink-0 animate-pulse rounded-l-2xl sm:h-auto sm:w-full sm:min-w-0 sm:max-w-none sm:aspect-[4/3] sm:rounded-none"
                  style={{ backgroundColor: "var(--input-bg)" }}
                />
                <div className="flex min-w-0 flex-1 flex-col justify-between p-4 sm:p-5">
                  <div className="h-4 w-full max-w-[85%] animate-pulse rounded" style={{ backgroundColor: "var(--input-bg)" }} />
                  <div className="mt-2 h-3 w-2/3 animate-pulse rounded" style={{ backgroundColor: "var(--input-bg)" }} />
                  <div className="mt-3 h-10 w-full animate-pulse rounded-xl sm:mt-4" style={{ backgroundColor: "var(--input-bg)" }} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <>
            {data.search && (
              <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                {total === 0
                  ? "Ningún producto coincide con la búsqueda."
                  : `${total} producto${total !== 1 ? "s" : ""} encontrado${total !== 1 ? "s" : ""}.`}
              </p>
            )}

            {!loading && total === 0 ? (
              <p
                className="rounded-2xl border px-6 py-12 text-center"
                style={{ borderColor: "var(--card-border)", backgroundColor: "var(--card-bg)", color: "var(--text-secondary)" }}
              >
                {data.search ? `No hay resultados para "${data.search}".` : "No hay productos disponibles en este momento."}
              </p>
            ) : productos.length > 0 ? (
              <>
                <p className="mb-4 text-xs sm:mb-5 sm:text-sm" style={{ color: "var(--text-secondary)" }}>
                  {productos.length} de {total} producto{total !== 1 ? "s" : ""}
                  {currentPage < totalPages && total > 0 && " — sigue bajando para cargar más"}
                </p>

                <div className="relative min-h-[200px]" suppressHydrationWarning>
                  {loading && productos.length === 0 && (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
                      style={{ backgroundColor: "var(--page-bg)" }}
                      aria-hidden
                    >
                      <span
                        className="inline-flex h-10 w-10 rounded-full border-2 border-[var(--color-brand-green)] border-t-transparent"
                        style={{ animation: "spin 0.7s linear infinite" }}
                      />
                    </div>
                  )}
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:gap-5 lg:grid-cols-3">
                  {productos.map((p, index) => (
                    <li key={p.id}>
                      <article
                        className="catalog-product-card catalog-card-in group relative flex h-full min-h-0 flex-row overflow-hidden rounded-2xl border transition-[transform] duration-300 sm:min-h-0 sm:flex-col sm:hover:-translate-y-0.5"
                        style={{
                          backgroundColor: "var(--card-bg)",
                          borderColor: "var(--card-border)",
                          animationDelay: `${Math.min(index, 14) * 0.045}s`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openViewer(
                              p.imagen_url || "",
                              p.producto,
                              p.producto,
                              formatBs(p.venta_bs),
                              formatBcv(p.venta_bcv),
                              p.status,
                              p
                            )
                          }
                          className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-inset"
                          aria-label={`Abrir ${p.producto}`}
                        />
                        <div
                          className="relative z-10 w-[38%] min-w-[120px] max-w-[160px] shrink-0 border-r pointer-events-none sm:w-full sm:min-w-0 sm:max-w-none sm:border-r-0 sm:border-b"
                          style={{ backgroundColor: "var(--input-bg)", borderColor: "var(--card-border)" }}
                          suppressHydrationWarning
                        >
                          <div className="relative h-full w-full overflow-hidden rounded-l-2xl sm:aspect-[4/3] sm:h-auto sm:rounded-none" suppressHydrationWarning>
                            <img
                              src={p.imagen_url || "/placeholder.svg"}
                              alt={p.producto}
                              width={400}
                              height={300}
                              decoding="async"
                              loading={index < 4 ? "eager" : "lazy"}
                              fetchPriority={index === 0 ? "high" : undefined}
                              className="absolute inset-0 h-full w-full object-cover object-center transition duration-300 group-hover:scale-105"
                              onError={(e) => {
                                const target = e.currentTarget;
                                target.onerror = null;
                                target.src =
                                  "data:image/svg+xml," +
                                  encodeURIComponent(
                                    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23334155" width="400" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="16">Sin imagen</text></svg>'
                                  );
                              }}
                            />
                            <span
                              className="absolute bottom-2 left-2 rounded-lg px-2 py-1 text-xs font-medium opacity-0 transition group-hover:opacity-100"
                              style={{ backgroundColor: "var(--color-brand-green)", color: "var(--color-on-brand)" }}
                            >
                              Ver imagen
                            </span>
                          </div>
                        </div>
                        <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-between p-4 pointer-events-none sm:p-4 sm:p-5" suppressHydrationWarning>
                          <div suppressHydrationWarning>
                            <h2 className="line-clamp-2 text-sm font-medium leading-snug sm:text-base" style={{ color: "var(--text-primary)" }}>
                              {p.producto}
                            </h2>
                            <div className="mt-1.5 flex flex-wrap gap-1" suppressHydrationWarning>
                              {p.en_oferta && (
                                <span
                                  className="inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-semibold shadow-sm"
                                  style={{
                                    backgroundColor: "var(--color-badge-accent-bg)",
                                    color: "var(--color-badge-accent-text)",
                                    border: "1px solid var(--color-badge-accent-border)",
                                  }}
                                >
                                  En oferta
                                </span>
                              )}
                              {p.status === "agotado" && (
                                <span
                                  className="inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-semibold"
                                  style={{ backgroundColor: "#dc2626", color: "white" }}
                                >
                                  Agotado
                                </span>
                              )}
                            </div>
                            <div className="mt-2 flex flex-col gap-0.5 sm:mt-3" suppressHydrationWarning>
                              <span
                                className="text-lg font-bold tabular-nums sm:text-xl sm:text-2xl"
                                style={p.status === "agotado" ? { color: "var(--text-secondary)", fontWeight: 600 } : { color: "var(--color-brand-green)" }}
                              >
                                {formatBcv(p.venta_bcv)}
                              </span>
                              <span className="text-xs font-bold sm:text-sm tabular-nums" style={{ color: "var(--text-secondary)" }}>
                                Equivalente a {formatBs(p.venta_bs)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 pointer-events-auto sm:mt-4" suppressHydrationWarning>
                            {p.status === "agotado" ? (
                              isInConsulta(p.id) ? (
                                <>
                                  <span
                                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium"
                                    style={{ borderColor: "var(--color-brand-green)", color: "var(--color-brand-green)" }}
                                  >
                                    <CheckIcon className="h-5 w-5 shrink-0" />
                                    En mi carrito
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      toggleConsulta(p);
                                    }}
                                    className="rounded-xl px-3 py-2.5 text-sm font-medium transition hover:opacity-80"
                                    style={{ color: "var(--text-secondary)", backgroundColor: "var(--input-bg)" }}
                                    aria-label="Quitar de mi consulta"
                                  >
                                    Quitar
                                  </button>
                                </>
                              ) : (
                                <span
                                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium"
                                  style={{ borderColor: "var(--input-border)", color: "var(--text-secondary)", backgroundColor: "var(--input-bg)" }}
                                  aria-hidden
                                >
                                  Agotado — no disponible para consulta
                                </span>
                              )
                            ) : p.en_camino ? (
                              <span
                                className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-center text-sm font-medium leading-tight"
                                style={{ borderColor: "var(--color-brand-ink)", color: "var(--color-on-brand)", backgroundColor: "var(--color-brand-ink)" }}
                                aria-hidden
                              >
                                <span className="inline-flex items-center gap-2">
                                  <TruckIcon className="h-5 w-5 shrink-0" />
                                  Vienen en camino
                                </span>
                                <span>nuevas unidades</span>
                              </span>
                            ) : isInConsulta(p.id) ? (
                              <>
<span
                                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium"
                                  style={{ borderColor: "var(--color-brand-green)", color: "var(--color-brand-green)" }}
                                >
                                  <CheckIcon className="h-5 w-5 shrink-0" />
                                  En mi carrito
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    toggleConsulta(p);
                                  }}
                                  className="rounded-xl px-3 py-2.5 text-sm font-medium transition hover:opacity-80"
                                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--input-bg)" }}
                                  aria-label="Quitar de mi consulta"
                                >
                                  Quitar
                                </button>
                                </>
                              ) : (
                                <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  toggleConsulta(p);
                                }}
                                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition hover:opacity-90 sm:w-auto sm:flex-1 sm:py-2.5 sm:px-3"
                                style={{ backgroundColor: "var(--color-brand-green)", color: "var(--color-on-brand)" }}
                                aria-label="Añadir al carrito"
                              >
                                <CartIcon className="h-5 w-5 shrink-0" />
                                Añadir al carrito
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
                  {currentPage < totalPages && total > 0 && (
                    <div
                      ref={loadMoreSentinelRef}
                      className="catalog-load-more-sentinel flex items-center justify-center py-4"
                      aria-hidden
                      suppressHydrationWarning
                    >
                      <span
                        className={`catalog-load-more-spinner inline-flex h-8 w-8 rounded-full border-2 border-[var(--color-brand-green)] border-t-transparent ${loading ? "catalog-load-more-spinner-visible" : ""}`}
                        style={loading ? { animation: "spin 0.7s linear infinite" } : undefined}
                        aria-hidden
                      />
                    </div>
                  )}
                </div>

                {consultaItems.length > 0 && (
                  <div className="cart-fab-wrapper fixed right-4 bottom-6 z-[45] flex flex-row items-center justify-end gap-2 sm:right-6">
                    {cartToast && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="animate-cart-fab-hint-in order-first rounded-xl border px-3 py-2 shadow-lg"
                        style={{
                          backgroundColor: "var(--card-bg)",
                          borderColor: "var(--color-brand-green)",
                          color: "var(--text-primary)",
                        }}
                      >
                        <p className="text-sm font-medium">{cartToast}</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setConsultaPanelOpen(true)}
                      className={`cart-fab flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg transition hover:scale-105 active:scale-95 sm:h-16 sm:w-16 ${cartFabBounce ? "cart-fab-bounce" : ""}`}
                      style={{
                        backgroundColor: "var(--color-brand-green)",
                        color: "var(--color-on-brand)",
                      }}
                      aria-label={`Ver mi carrito (${consultaItems.length} productos)`}
                      title="Ver mi carrito"
                    >
                      <CartIcon className="h-7 w-7 sm:h-8 sm:w-8" />
                      <span
                        className={`cart-fab-badge absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${cartFabBounce ? "cart-fab-badge-pop" : ""}`}
                        style={{ backgroundColor: "var(--color-brand-ink)", color: "var(--color-on-brand)" }}
                      >
                        {consultaItems.length}
                      </span>
                    </button>
                  </div>
                )}

                {consultaPanelOpen && consultaItems.length > 0 && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Tu lista del carrito"
                    className="fixed inset-0 z-[45] flex items-center justify-center p-4"
                  >
                    <button
                      type="button"
                      className={`consulta-popup-overlay absolute inset-0 bg-black/60 ${consultaPopupVisible ? "consulta-popup-visible" : ""}`}
                      aria-label="Cerrar"
                      onClick={() => setConsultaPanelOpen(false)}
                    />
                    <div
                      className={`consulta-popup-content relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl shadow-2xl ${consultaPopupVisible ? "consulta-popup-visible" : ""}`}
                      style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--card-border)", borderWidth: "1px", borderStyle: "solid" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--card-border)" }}>
                        <div className="flex items-center gap-2">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "var(--color-brand-green-muted)", color: "var(--color-on-brand)" }}>
                            <CartIcon className="h-6 w-6" />
                          </span>
                          <div>
                            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                              Tu lista del carrito
                            </h2>
                            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                              {consultaItems.length} producto{consultaItems.length !== 1 ? "s" : ""} en el carrito
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setConsultaPanelOpen(false)}
                          className="rounded-xl p-2 transition hover:opacity-80"
                          style={{ color: "var(--text-secondary)" }}
                          aria-label="Cerrar"
                        >
                          <CloseIcon className="h-6 w-6" />
                        </button>
                      </div>
                      <div className="scrollbar-modern min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                        <p className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          Productos en tu carrito
                        </p>
                        <ul className="space-y-2 pb-2">
                          {consultaItems.map((item, index) => (
                            <li
                              key={item.id}
                              className="flex items-center gap-3 rounded-xl border p-3"
                              style={{ borderColor: "var(--input-border)", backgroundColor: "var(--input-bg)" }}
                            >
                              <span
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                                style={{ backgroundColor: "var(--color-brand-ink)", color: "var(--color-on-brand)" }}
                                aria-hidden
                              >
                                {index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setConsultaPanelOpen(false);
                                  openViewer(
                                    item.imagen_url || "",
                                    item.producto,
                                    item.producto,
                                    formatBs(item.venta_bs),
                                    formatBcv(item.venta_bcv),
                                    item.status,
                                    item
                                  );
                                }}
                                className="relative flex h-14 w-14 shrink-0 overflow-hidden rounded-lg text-left transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)]"
                                style={{ backgroundColor: "var(--card-bg)" }}
                                aria-label={`Abrir ${item.producto}`}
                              >
                                <img
                                  src={item.imagen_url || "/placeholder.svg"}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    target.onerror = null;
                                    target.src =
                                      "data:image/svg+xml," +
                                      encodeURIComponent(
                                        '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect fill="%23334155" width="56" height="56"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="10">Sin imagen</text></svg>'
                                      );
                                  }}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConsultaPanelOpen(false);
                                  openViewer(
                                    item.imagen_url || "",
                                    item.producto,
                                    item.producto,
                                    formatBs(item.venta_bs),
                                    formatBcv(item.venta_bcv),
                                    item.status,
                                    item
                                  );
                                }}
                                className="min-w-0 flex-1 text-left transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-[var(--card-bg)] rounded-lg -m-1 p-1"
                                aria-label={`Abrir ${item.producto}`}
                              >
                                <p className="line-clamp-2 text-sm font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                                  {item.producto}
                                </p>
                                {item.en_oferta && (
                                  <p className="mt-1">
                                    <span
                                      className="inline-block rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide shadow-sm"
                                      style={{
                                        backgroundColor: "var(--color-badge-accent-bg)",
                                        color: "var(--color-badge-accent-text)",
                                        border: "1px solid var(--color-badge-accent-border)",
                                      }}
                                    >
                                      En oferta
                                    </span>
                                  </p>
                                )}
                                <p className="mt-0.5 text-xs" style={{ color: "var(--text-primary)" }}>
                                  <span style={{ color: "var(--text-secondary)" }}>{formatBs(item.venta_bs)}</span>
                                  {" · "}
                                  <span style={{ color: "var(--color-brand-green)" }}>{formatBcv(item.venta_bcv)}</span>
                                </p>
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromConsulta(item.id)}
                                className="shrink-0 rounded-xl p-2 transition hover:opacity-80"
                                style={{ color: "var(--text-secondary)" }}
                                aria-label={`Quitar ${item.producto} de tu lista`}
                                title="Quitar de la lista"
                              >
                                <CloseIcon className="h-5 w-5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="shrink-0 border-t px-4 py-3" style={{ borderColor: "var(--card-border)" }}>
                        <p className="mb-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                          Se abrirá WhatsApp con tu mensaje listo. Solo tienes que enviar.
                        </p>
                        <button
                          type="button"
                          disabled={whatsappPreparing}
                          onClick={() => {
                            if (whatsappPreparing) return;
                            setWhatsappPreparing(true);
                            const url = buildWhatsAppUrlFromConsulta(consultaItems);
                            setTimeout(() => {
                              window.open(url, "_blank", "noopener,noreferrer");
                              setWhatsappPreparing(false);
                            }, 1200);
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 disabled:opacity-90"
                          style={{ backgroundColor: "#25D366", color: "white" }}
                        >
                          {whatsappPreparing ? (
                            <>
                              <span
                                className="h-5 w-5 shrink-0 rounded-full border-2 border-white border-t-transparent"
                                style={{ animation: "spin 0.7s linear infinite" }}
                                aria-hidden
                              />
                              <span>Preparando mensaje...</span>
                            </>
                          ) : (
                            <>
                              <WhatsAppIcon className="h-5 w-5 shrink-0" />
                              Enviar carrito por WhatsApp
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </main>

      <footer className="border-t" style={{ borderColor: "var(--card-border)", backgroundColor: "var(--page-bg)" }}>
        <div className="mx-auto max-w-6xl px-3 py-8 text-center sm:px-4 lg:px-6">
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Sitio principal:{" "}
            <a
              href={MAIN_SITE_URL}
              className="font-semibold underline underline-offset-2 transition hover:opacity-90"
              style={{ color: "var(--color-brand-green)" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              powervit.fit
            </a>
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {SITE_NAME} · Precios referenciales en BCV.
          </p>
        </div>
      </footer>

      {/* Bottom sheet: calculadora tasa de cambio USD / Bs */}
      {tasaSheetOpen && ofertaTasaBcv != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Calculadora de tasa de cambio"
          className="fixed inset-0 z-[55] flex flex-col justify-end"
        >
          <button
            type="button"
            className={`tasa-sheet-overlay absolute inset-0 bg-black/50 ${tasaSheetVisible && !isSheetClosing ? "tasa-sheet-visible" : ""} ${isSheetClosing ? "tasa-sheet-overlay-closing" : ""}`}
            aria-label="Cerrar"
            onClick={closeTasaSheet}
          />
          <div
            ref={tasaSheetPanelRef}
            className={`tasa-sheet-panel relative flex max-h-[85vh] flex-col rounded-t-2xl shadow-2xl ${tasaSheetVisible && !isSheetClosing ? "tasa-sheet-visible" : ""} ${isSheetClosing ? "tasa-sheet-panel-closing" : ""}`}
            style={{
              backgroundColor: "var(--card-bg)",
              borderColor: "var(--card-border)",
              borderWidth: "1px",
              borderBottomWidth: 0,
              borderStyle: "solid",
              transform: !isSheetClosing && sheetDragY > 0 ? `translateY(${sheetDragY}px)` : undefined,
              transition: isSheetDragging ? "none" : undefined,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="shrink-0 cursor-grab active:cursor-grabbing px-4 pt-3 pb-2 touch-none select-none"
              onTouchStart={(e) => {
                e.preventDefault();
                handleSheetDragStart(e.touches[0].clientY);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSheetDragStart(e.clientY);
              }}
              role="button"
              tabIndex={0}
              aria-label="Arrastrar para cerrar"
            >
              <div className="mx-auto h-1 w-10 shrink-0 rounded-full" style={{ backgroundColor: "var(--text-secondary)", opacity: 0.6 }} aria-hidden />
              <h2 className="mt-3 text-center text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                Calculadora
              </h2>
              <p className="mt-1 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                Convierte entre dólares y bolívares al instante
              </p>
            </div>
            <div className="shrink-0 px-4 pb-4">
              <div className="flex items-end gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="tasa-sheet-usd" className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    USD
                  </label>
                  <div className="flex rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--input-border)", backgroundColor: "var(--input-bg)" }}>
                    <span className="shrink-0 pr-1 text-sm" style={{ color: "var(--text-secondary)" }}>$</span>
                    <input
                      id="tasa-sheet-usd"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={calcUsdInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCalcUsdInput(v);
                        if (ofertaTasaBcv != null && ofertaTasaBcv > 0) {
                          const n = parseDecimalInput(v);
                          if (n != null && Number.isFinite(n)) setCalcBsInput((n * ofertaTasaBcv).toFixed(2));
                          else if (v.trim() === "") setCalcBsInput("");
                        }
                      }}
                      className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                      style={{ color: "var(--text-primary)" }}
                      aria-label="Cantidad en dólares"
                    />
                  </div>
                </div>
                <div className="shrink-0 pb-2.5" style={{ color: "var(--text-secondary)" }} aria-hidden>
                  <svg className="h-5 w-5 sm:h-6 sm:w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                  <span className="sr-only">Convertir entre USD y Bs</span>
                </div>
                <div className="min-w-0 flex-1">
                  <label htmlFor="tasa-sheet-bs" className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Bs
                  </label>
                  <div className="flex rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--input-border)", backgroundColor: "var(--card-oferta-bg)", color: "var(--text-primary)" }}>
                    <span className="shrink-0 pr-1 text-sm" style={{ color: "var(--text-secondary)" }}>Bs</span>
                    <input
                      id="tasa-sheet-bs"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={calcBsInput}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCalcBsInput(v);
                        if (ofertaTasaBcv != null && ofertaTasaBcv > 0) {
                          const n = parseDecimalInput(v);
                          if (n != null && Number.isFinite(n)) setCalcUsdInput((n / ofertaTasaBcv).toFixed(2));
                          else if (v.trim() === "") setCalcUsdInput("");
                        }
                      }}
                      className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                      style={{ color: "var(--text-primary)" }}
                      aria-label="Cantidad en bolívares"
                    />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                Tasa de cambio de acuerdo al Banco Central de Venezuela
              </p>
            </div>
            <div className="shrink-0 px-4 pb-6 pt-0 sm:pb-8" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} />
          </div>
        </div>
      )}

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={viewer.productName != null ? "viewer-product-title" : undefined}
          aria-label={viewer.productName == null ? "Detalle del producto" : undefined}
          className="fixed inset-0 z-[70] flex items-end justify-center overflow-hidden md:items-center md:p-4"
        >
          <button
            type="button"
            className={`viewer-overlay absolute inset-0 z-0 ${viewerVisible && !viewerClosing ? "viewer-visible" : ""} ${viewerClosing ? "viewer-closing" : ""}`}
            aria-label="Cerrar"
            onClick={closeViewerWithBack}
          />
          <div
            className={`viewer-content relative z-[55] flex w-full max-h-[100dvh] flex-col md:h-auto md:min-h-0 md:max-h-[min(88vh,820px)] md:max-w-[min(96vw,960px)] md:flex-none ${viewerVisible && !viewerClosing ? "viewer-visible" : ""} ${viewerClosing ? "viewer-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="viewer-panel flex min-h-[72dvh] w-full max-h-[100dvh] flex-col overflow-y-auto overflow-x-hidden rounded-t-[1.35rem] border sm:min-h-[76dvh] md:h-[min(88vh,820px)] md:min-h-0 md:max-h-[min(88vh,820px)] md:flex-row md:overflow-hidden md:rounded-3xl"
              style={{
                backgroundColor: "var(--card-bg)",
                borderColor: "var(--card-border)",
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  popstateFromClosingViewerRef.current = true;
                  if (typeof window !== "undefined" && window.history?.length > 1) window.history.back();
                  closeViewer();
                }}
                className="viewer-close-btn absolute right-2 top-2 z-[60] flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-green)] focus:ring-offset-2 focus:ring-offset-transparent md:right-4 md:top-4 md:min-h-[44px] md:min-w-[44px]"
                aria-label="Cerrar"
              >
                <CloseIcon className="h-5 w-5 md:h-7 md:w-7" />
              </button>
              <div
                ref={viewerImageContainerRef}
                tabIndex={-1}
                className="viewer-hero shrink-0 outline-none"
              >
                <img
                  src={viewer.url || "/placeholder.svg"}
                  alt={viewer.alt}
                  decoding="async"
                  className="select-none"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.onerror = null;
                    target.src =
                      "data:image/svg+xml," +
                      encodeURIComponent(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="%23334155" width="400" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-family="sans-serif" font-size="16">Error al cargar</text></svg>'
                      );
                  }}
                />
              </div>
              {(viewer.status === "agotado" || viewer.productName != null || viewer.priceBs != null || viewer.priceBcv != null) && (
                <div className="viewer-details-col gap-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:min-h-0 md:flex-1 md:gap-0 md:px-6 md:py-5">
                  <div className="viewer-mobile-meta flex flex-col gap-3 md:min-h-0 md:gap-4">
                    <div className="viewer-detail-reveal viewer-stagger-1 md:border-b md:pb-4" style={{ borderColor: "var(--card-border)" }}>
                      {viewer.productName != null && (
                        <h2
                          id="viewer-product-title"
                          title={viewer.productName}
                          className="line-clamp-3 text-base font-semibold leading-[1.35] tracking-tight text-balance md:text-xl md:leading-snug"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {viewer.productName}
                        </h2>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {viewer.product?.en_oferta && (
                          <span
                            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide md:text-[11px]"
                            style={{
                              backgroundColor: "var(--color-badge-accent-bg)",
                              color: "var(--color-badge-accent-text)",
                              border: "1px solid var(--color-badge-accent-border)",
                            }}
                          >
                            En oferta
                          </span>
                        )}
                        {viewer.status === "agotado" && (
                          <span className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide md:text-[11px]" style={{ backgroundColor: "#dc2626", color: "white" }}>
                            Agotado
                          </span>
                        )}
                      </div>
                    </div>
                    {(viewer.priceBcv != null || viewer.priceBs != null) && (
                      <div className="viewer-detail-reveal viewer-stagger-2 viewer-price-card">
                        {viewer.priceBcv != null && (
                          <p
                            className="text-[1.35rem] font-bold tabular-nums leading-none tracking-tight md:text-3xl"
                            style={
                              viewer.product?.status === "agotado"
                                ? { color: "var(--text-secondary)", fontWeight: 600 }
                                : { color: "var(--color-brand-green)" }
                            }
                          >
                            {viewer.priceBcv}
                          </p>
                        )}
                        {viewer.priceBs != null && (
                          <p className="mt-1.5 text-[0.8125rem] font-medium leading-snug tabular-nums md:text-sm" style={{ color: "var(--text-secondary)" }}>
                            Equiv. {viewer.priceBs}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {viewer.product && (viewer.status === "agotado" || viewer.productName != null || viewer.priceBs != null || viewer.priceBcv != null) && (
                    <div className="viewer-mobile-footer mt-3 flex flex-col gap-2.5 border-t pt-3 md:mt-4 md:gap-4 md:border-t-0 md:pt-0" style={{ borderColor: "var(--card-border)" }}>
                      <div className="viewer-mobile-actions viewer-detail-reveal viewer-stagger-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:gap-3">
                        {viewer.product.status === "agotado" ? (
                          isInConsulta(viewer.product.id) ? (
                            <>
                              <button
                                type="button"
                                onClick={() => viewerImageContainerRef.current?.focus({ preventScroll: true })}
                                className="viewer-action-btn flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold md:min-h-[44px] md:rounded-xl md:px-4 md:py-3"
                                style={{ borderColor: "var(--color-brand-green)", color: "var(--color-brand-green)", backgroundColor: "transparent" }}
                                aria-label="Resaltar imagen del producto"
                              >
                                <CheckIcon className="h-5 w-5 shrink-0" />
                                En carrito
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleConsulta(viewer.product!)}
                                className="min-h-[48px] rounded-2xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 md:min-h-[44px] md:min-w-[96px] md:rounded-xl"
                                style={{ color: "var(--text-secondary)", backgroundColor: "var(--input-bg)" }}
                                aria-label="Quitar de mi consulta"
                              >
                                Quitar
                              </button>
                            </>
                          ) : (
                            <div
                              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border px-4 py-3 text-center text-sm font-medium md:min-h-0 md:rounded-xl md:py-3"
                              style={{ borderColor: "var(--input-border)", color: "var(--text-secondary)", backgroundColor: "var(--input-bg)" }}
                              aria-hidden
                            >
                              No disponible para consulta
                            </div>
                          )
                        ) : viewer.product.en_camino ? (
                          <div
                            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold md:min-h-0 md:rounded-xl md:py-3"
                            style={{ color: "var(--color-on-brand)", backgroundColor: "var(--color-brand-ink)" }}
                            aria-hidden
                          >
                            <TruckIcon className="h-5 w-5 shrink-0" />
                            En camino
                          </div>
                        ) : isInConsulta(viewer.product.id) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => viewerImageContainerRef.current?.focus({ preventScroll: true })}
                              className="viewer-action-btn flex min-h-[48px] min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold md:min-h-[44px] md:rounded-xl"
                              style={{ borderColor: "var(--color-brand-green)", color: "var(--color-brand-green)", backgroundColor: "transparent" }}
                              aria-label="Resaltar imagen del producto"
                            >
                              <CheckIcon className="h-5 w-5 shrink-0" />
                              En carrito
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleConsulta(viewer.product!)}
                              className="min-h-[48px] rounded-2xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 md:min-h-[44px] md:min-w-[96px] md:rounded-xl"
                              style={{ color: "var(--text-secondary)", backgroundColor: "var(--input-bg)" }}
                              aria-label="Quitar de mi consulta"
                            >
                              Quitar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              toggleConsulta(viewer.product!);
                              closeViewer();
                            }}
                            className="viewer-action-btn flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-2xl px-4 py-3.5 text-[0.9375rem] font-semibold shadow-lg md:min-h-[48px] md:rounded-xl md:text-sm"
                            style={{
                              backgroundColor: "var(--color-brand-green)",
                              color: "var(--color-on-brand)",
                              boxShadow: "0 4px 14px rgb(22 163 74 / 0.35)",
                            }}
                            aria-label="Añadir al carrito"
                          >
                            <CartIcon className="h-5 w-5 shrink-0" />
                            Añadir al carrito
                          </button>
                        )}
                      </div>

                      <div className="viewer-mobile-chat viewer-chat-strip viewer-detail-reveal viewer-stagger-4 flex flex-col gap-2 md:border-t md:pt-4" style={{ borderColor: "var(--card-border)" }}>
                        <p className="hidden text-xs leading-relaxed md:block md:text-sm" style={{ color: "var(--text-secondary)" }}>
                          Obtén una explicación breve sobre para qué sirve este producto.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            chatPopupRef.current?.openAndSendMessage(`¿Para qué sirve ${viewer.product!.producto}?`);
                            closeViewer();
                          }}
                          className="viewer-action-btn flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm font-medium transition hover:opacity-90 md:min-h-[46px] md:rounded-xl md:border-2 md:border-solid md:py-2.5"
                          style={{
                            borderColor: "rgb(22 163 74 / 0.45)",
                            color: "var(--color-brand-green)",
                            backgroundColor: "rgb(22 163 74 / 0.06)",
                          }}
                        >
                          <MessageCircleIcon className="h-[1.125rem] w-[1.125rem] shrink-0 md:h-5 md:w-5" />
                          Ver información del producto
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ChatbotPopup
        ref={chatPopupRef}
        suppressFab={!!viewer}
        onOpenProduct={handleChatOpenProduct}
        onAddToCart={handleChatAddToCart}
        cartItemIds={consultaItems.map((i) => i.id)}
        onChatOpen={flushPendingSearchNoScroll}
        onChatHistoryBack={() => {
          skipCatalogPopstateForChatRef.current = true;
          flushPendingSearchNoScroll();
        }}
      />
      </div>
  );
}
