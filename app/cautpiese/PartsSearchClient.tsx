"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/components/layout/LanguageProvider";
import type { PartOffer, PartsSearchResponse } from "@/lib/parts/types";
import {
  beginCautpieseTransfer,
  clearCautpieseBasket,
  formatOffersQuote,
  getCautpieseBasketCount,
  peekCautpieseOrderItems,
  pushOffersToOrderDraft,
  reconcileCautpieseBasket,
  removeCautpieseBasketItem,
} from "@/lib/parts/order-bridge";
import {
  clearCautpieseUiSession,
  clearRecentQueries,
  loadCautpieseUiSession,
  pushRecentQuery,
  removeRecentQuery,
  saveCautpieseUiSession,
  suggestRecentQueries,
} from "@/lib/parts/cautpiese-session";
import type { SupplierSearchResult } from "@/lib/parts/types";
import type { OrderItemFormData, OrderWithDetails } from "@/lib/types";
import { getOrders } from "@/lib/supabase";
import {
  ArrowDownUp,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Store,
  Tag,
  Trash2,
  Trophy,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";

type Tab = "code" | "vin" | "suppliers";
type SortKey = "price" | "brand" | "supplier" | "stock" | "match";

type MetaSupplier = {
  id: string;
  name: string;
  website: string | null;
  city: string | null;
  online: boolean;
  hasWebsite?: boolean;
  status?: "online" | "website" | "offline";
  notes: string | null;
};

type Meta = {
  allSuppliers: MetaSupplier[];
  totals: { catalog: number; scrapable: number; offline: number; websiteOnly?: number };
  hasProxy?: boolean;
  hasUnlock?: boolean;
  hasAutomallCookie?: boolean;
};

type VinModelsResponse = {
  vehicle: {
    vin: string;
    valid: boolean;
    make?: string;
    model?: string;
    modelYear?: string;
    engine?: string;
    fuel?: string;
    productionDate?: string;
    transmission?: string;
    error?: string;
    brandSlug?: string | null;
    raw?: Record<string, string>;
  };
  modifications: Array<{
    id: string;
    brandSlug: string;
    name: string;
    path: string;
    yearHint?: string;
    oemCatalogUrl?: string;
    engine?: string;
    source?: string;
  }>;
  tookMs: number;
};

type VinCatalogResponse = {
  vehiclePath: string;
  vehicleName: string;
  groups: Array<{
    id: string;
    nameRu: string;
    nameRo: string;
    children: Array<{
      id: string;
      nameRu: string;
      nameRo: string;
      maintenance?: boolean;
      enormId?: number;
      searchHints?: string[];
    }>;
  }>;
  maintenance: Array<{ id: string; nameRu: string; nameRo: string }>;
  /** Factory EPC root groups (elcats/catcar) — full car tree */
  oemGroups?: Array<{ id?: string; title: string; url: string }>;
  /** Factory EPC units with real names (elcats) */
  oemUnits?: Array<{
    title: string;
    groupId: string;
    rootId?: string;
    rootTitle?: string;
    navNode?: {
      id: string;
      title: string;
      action: string;
      fields: Record<string, string>;
    };
  }>;
  oemNavNodes?: Array<{
    id: string;
    title: string;
    action: string;
    fields: Record<string, string>;
    rootId?: string;
    rootTitle?: string;
  }>;
  rootNodes?: Array<{ id: number; name: string; path?: string }>;
};

type VinCompareResponse = {
  vehiclePath: string;
  vehicleName?: string;
  partType: { id: string; nameRu: string; nameRo: string };
  articles: string[];
  oemParts?: Array<{ article: string; name: string; unitTitle?: string }>;
  offers: PartOffer[];
  vehicleOffers: PartOffer[];
  bestPrice: number | null;
  bestSupplier: string | null;
  inStockCount: number;
  suppliersOk: number;
  tookMs: number;
  explanation: string;
  sourceUrl?: string;
};

const STOCK_LABEL: Record<string, { ru: string; ro: string }> = {
  in_stock: { ru: "В наличии", ro: "În stoc" },
  order: { ru: "Под заказ", ro: "La comandă" },
  out: { ru: "Нет", ro: "Lipsă" },
  unknown: { ru: "—", ro: "—" },
};

const MATCH_LABEL: Record<string, { ru: string; ro: string; variant: "default" | "secondary" | "outline" }> = {
  exact: { ru: "Точный код", ro: "Cod exact", variant: "default" },
  cross: { ru: "Аналог / кросс", ro: "Analog / cross", variant: "secondary" },
  weak: { ru: "Слабое совп.", ro: "Potrivire slabă", variant: "outline" },
};

export function PartsSearchClient() {
  const { language, tp } = useLanguage();
  const isRo = language === "ro";

  const [tab, setTab] = useState<Tab>("code");
  const [meta, setMeta] = useState<Meta | null>(null);

  // Article search
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [data, setData] = useState<PartsSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("match");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyExact, setOnlyExact] = useState(true);
  const [brandFilter, setBrandFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [diagOpen, setDiagOpen] = useState(false);
  const [orderToast, setOrderToast] = useState<string | null>(null);
  const [basketCount, setBasketCount] = useState(0);
  const [basketItems, setBasketItems] = useState<OrderItemFormData[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [destOpen, setDestOpen] = useState(false);
  const [destOrders, setDestOrders] = useState<OrderWithDetails[]>([]);
  const [newOrderDraftPreview, setNewOrderDraftPreview] = useState<{
    items: number;
    clientId?: string;
    savedAt?: string;
  } | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [sessionRestoredBanner, setSessionRestoredBanner] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [codeSuggestOpen, setCodeSuggestOpen] = useState(false);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const codeInputWrapRef = useRef<HTMLDivElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const [suggestBox, setSuggestBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const router = useRouter();

  const refreshBasket = useCallback(() => {
    reconcileCautpieseBasket();
    setBasketCount(getCautpieseBasketCount());
    setBasketItems(peekCautpieseOrderItems());
  }, []);

  useEffect(() => {
    refreshBasket();
    const onChange = () => refreshBasket();
    const onFocus = () => refreshBasket();
    window.addEventListener("cautpiese-basket-change", onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshBasket();
    });
    return () => {
      window.removeEventListener("cautpiese-basket-change", onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshBasket]);

  // VIN flow
  const [vin, setVin] = useState("");
  const [vinStep, setVinStep] = useState<1 | 2 | 3 | 4>(1);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinModels, setVinModels] = useState<VinModelsResponse | null>(null);
  const [selectedMod, setSelectedMod] = useState<VinModelsResponse["modifications"][0] | null>(null);
  /** Vehicle-level OEM EPC URL (survives selecting ENORM-only modification) */
  const [vehicleOemCatalog, setVehicleOemCatalog] = useState("");
  /** Live elcats catalog URL loaded in embed iframe (proxy) */
  const [elcatsEmbedUrl, setElcatsEmbedUrl] = useState<string>("");
  const [vinCatalog, setVinCatalogData] = useState<VinCatalogResponse | null>(null);
  const [selectedPartType, setSelectedPartType] = useState<string>("");
  const [vinCompare, setVinCompare] = useState<VinCompareResponse | null>(null);
  const [modFilter, setModFilter] = useState("");
  /** Interactive EPC browser (elcats) */
  const [epcRootId, setEpcRootId] = useState<string>("all");
  const [epcQuery, setEpcQuery] = useState("");
  const [epcUnit, setEpcUnit] = useState<{
    groupId: string;
    title: string;
    rootTitle?: string;
    navNode?: {
      id: string;
      title: string;
      action: string;
      fields: Record<string, string>;
    };
  } | null>(null);
  const [epcParts, setEpcParts] = useState<
    Array<{
      article: string;
      name: string;
      shortCode?: string;
      qty?: string;
      unitTitle?: string;
      groupId?: string;
      options?: string;
    }>
  >([]);
  const [epcDiagram, setEpcDiagram] = useState<{
    url: string;
    width?: number;
    points: Array<{ code: string; title: string; left: number; top: number; width: number; height: number }>;
  } | null>(null);
  const [epcSubUnits, setEpcSubUnits] = useState<
    Array<{
      modelGuid: string;
      unitGuid: string;
      title: string;
      thumbUrl?: string;
      navNode?: { id: string; title: string; action: string; fields: Record<string, string> };
    }>
  >([]);
  const [epcActiveScheme, setEpcActiveScheme] = useState<string | null>(null);
  const [epcHighlight, setEpcHighlight] = useState<string | null>(null);
  const [epcPartsLoading, setEpcPartsLoading] = useState(false);
  const [epcStatus, setEpcStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/parts/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta(null));
  }, []);

  // Restore once after mount (no SSR/sessionStorage mismatch)
  useEffect(() => {
    const s = loadCautpieseUiSession();
    if (s) {
      setTab(s.tab || "code");
      setCode(s.code || "");
      setData(s.data || null);
      setError(s.error || null);
      setSortKey(s.sortKey || "match");
      setOnlyInStock(Boolean(s.onlyInStock));
      setOnlyExact(s.onlyExact !== false);
      setBrandFilter(s.brandFilter || "all");
      setSupplierFilter(s.supplierFilter || "all");
      setVin(s.vin || "");
      setVinStep(s.vinStep || 1);
      setVinModels((s.vinModels as VinModelsResponse | null) || null);
      setSelectedMod(
        (s.selectedMod as VinModelsResponse["modifications"][0] | null) || null
      );
      setVehicleOemCatalog(s.vehicleOemCatalog || "");
      setVinCompare((s.vinCompare as VinCompareResponse | null) || null);
      setModFilter(s.modFilter || "");
      if (s.data || s.code || s.vin) setSessionRestoredBanner(true);
    }
    setSessionReady(true);
  }, []);

  // Persist UI so /orders → back keeps results (basket is separate localStorage)
  useEffect(() => {
    if (!sessionReady) return;
    const snap = {
      tab,
      code,
      data,
      error,
      sortKey,
      onlyInStock,
      onlyExact,
      brandFilter,
      supplierFilter,
      vin,
      vinStep,
      vinModels,
      selectedMod,
      vehicleOemCatalog,
      vinCompare,
      modFilter,
    };
    const t = window.setTimeout(() => saveCautpieseUiSession(snap), 200);
    const flush = () => saveCautpieseUiSession(snap);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pagehide", flush);
    };
  }, [
    sessionReady,
    tab,
    code,
    data,
    error,
    sortKey,
    onlyInStock,
    onlyExact,
    brandFilter,
    supplierFilter,
    vin,
    vinStep,
    vinModels,
    selectedMod,
    vehicleOemCatalog,
    vinCompare,
    modFilter,
  ]);

  const clearSearchSession = useCallback(() => {
    clearCautpieseUiSession();
    setData(null);
    setError(null);
    setCode("");
    setVin("");
    setVinModels(null);
    setSelectedMod(null);
    setVinCompare(null);
    setVehicleOemCatalog("");
    setVinCatalogData(null);
    setElcatsEmbedUrl("");
    setVinStep(1);
    setSessionRestoredBanner(false);
    setBrandFilter("all");
    setSupplierFilter("all");
    setModFilter("");
  }, []);

  const mergeResults = useCallback((core: PartsSearchResponse, secondary: PartsSearchResponse): PartsSearchResponse => {
    const bySupplier = new Map<string, SupplierSearchResult>();
    for (const r of [...(core.results || []), ...(secondary.results || [])]) {
      const prev = bySupplier.get(r.supplier);
      if (!prev) {
        bySupplier.set(r.supplier, { ...r, offers: [...r.offers] });
      } else {
        prev.offers.push(...r.offers);
        prev.ok = prev.ok || r.ok;
        prev.blocked = prev.blocked || r.blocked;
        if (!prev.error && r.error) prev.error = r.error;
        prev.durationMs = Math.max(prev.durationMs || 0, r.durationMs || 0);
      }
    }
    const results = [...bySupplier.values()];
    const offersMap = new Map<string, PartOffer>();
    for (const o of [...(core.offers || []), ...(secondary.offers || [])]) {
      // never re-introduce weak / junk / shell placeholders
      if (o.matchType === "weak" || o.isShell) continue;
      if (/^открыть\s+/i.test(o.name || "")) continue;
      const k = `${o.supplier}|${o.article}|${o.brand}|${o.price}`;
      if (!offersMap.has(k)) offersMap.set(k, o);
    }
    const offers = [...offersMap.values()];
    const exactOffers = offers.filter((o) => o.matchType === "exact");
    const crossOffers = offers.filter((o) => o.matchType === "cross");
    // Accept any sane MDL price (including "low" confidence from guest scrapers)
    const trusted = offers.filter(
      (o) =>
        o.price != null &&
        o.price >= 3 &&
        o.price <= 50_000 &&
        !o.isShell &&
        (!o.currency || /^(MDL|L|LEI|LEU)$/i.test(o.currency))
    );
    const shopLinksMap = new Map<string, { supplier: string; supplierName: string; url: string; label: string }>();
    for (const o of [...(core.shopLinks || []), ...(secondary.shopLinks || [])]) {
      if (o.url && !shopLinksMap.has(o.supplier)) shopLinksMap.set(o.supplier, o);
    }
    // Also collect shells from raw results if server put them only in offers before
    for (const r of results) {
      for (const o of r.offers || []) {
        if ((o.isShell || /^открыть\s+/i.test(o.name || "")) && o.url && !shopLinksMap.has(o.supplier)) {
          shopLinksMap.set(o.supplier, {
            supplier: o.supplier,
            supplierName: o.supplierName,
            url: o.url,
            label: o.name,
          });
        }
      }
    }
    const shopLinks = [...shopLinksMap.values()];
    const bestPrice = trusted.length ? Math.min(...trusted.map((o) => o.price!)) : null;
    const exactTrusted = exactOffers.filter((o) => trusted.includes(o));
    const bestExactPrice = exactTrusted.length
      ? Math.min(...exactTrusted.map((o) => o.price!))
      : null;
    const pricedN = offers.filter((o) => o.price != null && o.price > 0).length;
    return {
      ...core,
      results,
      offers,
      exactOffers,
      crossOffers,
      shopLinks: shopLinks.length ? shopLinks : undefined,
      bestPrice,
      bestExactPrice,
      bestSupplier: trusted.find((o) => o.price === bestPrice)?.supplier ?? null,
      inStockCount: offers.filter((o) => o.stock === "in_stock" || o.stock === "order").length,
      suppliersTotal: results.length,
      suppliersOk: results.filter((r) => r.ok && r.offers.some((o) => o.price != null || o.url)).length,
      tookMs: (core.tookMs || 0) + (secondary.tookMs || 0),
      phase: "all",
      cached: false,
      explanation:
        `«${core.query}»: ${exactOffers.length} точных + ${crossOffers.length} аналогов` +
        (pricedN ? `, ${pricedN} с ценой` : "") +
        (shopLinks.length ? ` · ${shopLinks.length} прямых ссылок на MD` : "") +
        " (ядро + расширенные).",
    };
  }, []);

  const codeSuggestions = useMemo(
    () => suggestRecentQueries(code, 5),
    // recompute when list or input changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, recentQueries]
  );

  useEffect(() => {
    setRecentQueries(suggestRecentQueries("", 40));
  }, []);

  const updateSuggestBox = useCallback(() => {
    const el = codeInputRef.current;
    if (!el) {
      setSuggestBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setSuggestBox({
      top: r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 200),
    });
  }, []);

  useLayoutEffect(() => {
    if (!codeSuggestOpen || codeSuggestions.length === 0) {
      setSuggestBox(null);
      return;
    }
    updateSuggestBox();
    const onScroll = () => updateSuggestBox();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [codeSuggestOpen, codeSuggestions.length, code, updateSuggestBox]);

  useEffect(() => {
    if (!codeSuggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const wrap = codeInputWrapRef.current;
      const portal = document.getElementById("cautpiese-code-suggest-portal");
      if (wrap?.contains(t) || portal?.contains(t)) return;
      setCodeSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [codeSuggestOpen]);

  const searchCode = useCallback(
    async (raw?: string, fresh = false) => {
      const q = (raw ?? code).trim();
      if (q.length < 3) {
        setError(tp("Введите артикул (минимум 3 символа)"));
        return;
      }
      if (raw != null) setCode(q);
      setCodeSuggestOpen(false);
      setLoading(true);
      setExpanding(false);
      setError(null);
      setBrandFilter("all");
      setSupplierFilter("all");
      // Search compact + hyphen variants (MD shops differ)
      const variants = [
        q,
        q.replace(/\s+/g, ""),
        q.replace(/[\s\-]/g, ""),
      ].filter((v, i, a) => v.length >= 3 && a.indexOf(v) === i);

      try {
        // Phase 1: core (fast trusted shops) — primary form first
        const res = await fetch(
          `/api/parts/search?q=${encodeURIComponent(variants[0]!)}&phase=core${fresh ? "&fresh=1" : ""}`
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Ошибка");
          setData(null);
          return;
        }
        setData(json);
        setLoading(false);
        // Remember successful query for autocomplete
        setRecentQueries(pushRecentQuery(q));

        // Phase 2: secondary + extra article forms (non-blocking)
        setExpanding(true);
        try {
          let acc = json;
          // secondary for main + remaining variants (compact etc.)
          for (const v of variants) {
            const res2 = await fetch(
              `/api/parts/search?q=${encodeURIComponent(v)}&phase=secondary${fresh ? "&fresh=1" : ""}`
            );
            const json2 = await res2.json();
            if (res2.ok && json2) {
              acc = mergeResults(acc, json2);
              setData(acc);
            }
            // also re-hit core for alternate forms (e.g. without hyphen)
            if (v !== variants[0]) {
              const resC = await fetch(
                `/api/parts/search?q=${encodeURIComponent(v)}&phase=core${fresh ? "&fresh=1" : ""}`
              );
              const jsonC = await resC.json();
              if (resC.ok && jsonC) {
                acc = mergeResults(acc, jsonC);
                setData(acc);
              }
            }
          }
          // Phase 3: WAF-heavy (only if server has proxy/unlock — otherwise empty list)
          const resW = await fetch(
            `/api/parts/search?q=${encodeURIComponent(variants[0]!)}&phase=waf${fresh ? "&fresh=1" : ""}`
          );
          const jsonW = await resW.json();
          if (resW.ok && jsonW?.results?.length) {
            acc = mergeResults(acc, jsonW);
            setData(acc);
          }
        } catch {
          /* expand optional */
        } finally {
          setExpanding(false);
        }
      } catch {
        setError(tp("Сеть недоступна"));
        setLoading(false);
      }
    },
    [code, tp, mergeResults]
  );

  const addOfferToOrder = useCallback(
    (offer: PartOffer) => {
      const n = pushOffersToOrderDraft([offer]);
      refreshBasket();
      setOrderToast(
        `${tp("В корзине")}: ${n} · ${offer.brand} ${offer.article}`.trim()
      );
      // keep toast until user dismisses or opens cart — no auto-hide
    },
    [tp, refreshBasket]
  );

  const openDestinationDialog = useCallback(async () => {
    if (getCautpieseBasketCount() === 0) {
      setOrderToast(tp("Корзина пуста — сначала нажмите «В корзину» у позиции"));
      return;
    }
    setDestOpen(true);
    setOrdersLoading(true);
    setOrderQuery("");
    // Local new-order draft (черновик)
    try {
      const raw = window.localStorage.getItem("crm:new-order-draft");
      if (raw) {
        const d = JSON.parse(raw) as {
          selectedClientId?: string;
          items?: unknown[];
          savedAt?: string;
        };
        const n = Array.isArray(d.items) ? d.items.length : 0;
        if (d.selectedClientId || n > 0) {
          setNewOrderDraftPreview({
            items: n,
            clientId: d.selectedClientId,
            savedAt: d.savedAt,
          });
        } else setNewOrderDraftPreview(null);
      } else setNewOrderDraftPreview(null);
    } catch {
      setNewOrderDraftPreview(null);
    }
    try {
      // Recent first from API; we re-group open → rest
      const orders = await getOrders(100);
      setDestOrders(orders);
    } catch {
      setDestOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [tp]);

  const goNewOrder = useCallback(() => {
    // Hand off + clear basket immediately so return to CautPiese is empty
    beginCautpieseTransfer(null);
    refreshBasket();
    setOrderToast(null);
    setDestOpen(false);
    router.push("/orders/new");
  }, [router, refreshBasket]);

  const goExistingOrder = useCallback(
    (orderId: string) => {
      beginCautpieseTransfer(orderId);
      refreshBasket();
      setOrderToast(null);
      setDestOpen(false);
      router.push(`/orders/${orderId}/edit`);
    },
    [router, refreshBasket]
  );

  const OPEN_ORDER_STATUSES = useMemo(
    () => new Set(["Новый", "В работе", "Готов"]),
    []
  );

  const { openOrdersList, recentOrdersList } = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    const match = (o: OrderWithDetails) => {
      if (!q) return true;
      const blob = [
        o.client?.full_name,
        o.client?.phone,
        o.car?.brand,
        o.car?.model,
        o.car?.license_plate,
        o.car?.vin,
        o.status,
        o.id.slice(0, 8),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    };
    const statusRank = (s: string) =>
      s === "Новый" ? 0 : s === "В работе" ? 1 : s === "Готов" ? 2 : 9;
    const byDate = (a: OrderWithDetails, b: OrderWithDetails) =>
      new Date(b.order_date).getTime() - new Date(a.order_date).getTime();

    const filtered = destOrders.filter(match);
    const open = filtered
      .filter((o) => OPEN_ORDER_STATUSES.has(o.status))
      .sort((a, b) => statusRank(a.status) - statusRank(b.status) || byDate(a, b));
    const recent = filtered
      .filter((o) => !OPEN_ORDER_STATUSES.has(o.status))
      .sort(byDate)
      .slice(0, 25);
    return { openOrdersList: open, recentOrdersList: recent };
  }, [destOrders, orderQuery, OPEN_ORDER_STATUSES]);

  const copyQuote = useCallback(() => {
    if (!data) return;
    const text = formatOffersQuote(
      data.query,
      data.exactOffers || data.offers.filter((o) => o.matchType === "exact"),
      data.crossOffers || data.offers.filter((o) => o.matchType !== "exact"),
      data.bestPrice
    );
    void navigator.clipboard?.writeText(text);
    setOrderToast(tp("Сравнение скопировано"));
  }, [data, tp]);

  const decodeVin = useCallback(async () => {
    const v = vin.trim();
    if (v.length < 11) {
      setError(tp("Введите VIN"));
      return;
    }
    setVinLoading(true);
    setError(null);
    setVinCompare(null);
    setSelectedMod(null);
    setVinCatalogData(null);
    try {
      const res = await fetch(`/api/parts/vin?action=decode&vin=${encodeURIComponent(v)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "VIN error");
        return;
      }
      setVinModels(json);
      // Persist OEM catalog from VIN decode (first catcar variant or raw)
      const fromRaw = json?.vehicle?.raw?.OemCatalog || json?.vehicle?.raw?.CatcarSource || "";
      const fromMod = (json?.modifications || []).find(
        (m: { oemCatalogUrl?: string }) => m.oemCatalogUrl
      )?.oemCatalogUrl;
      setVehicleOemCatalog(fromMod || fromRaw || "");
      setVinStep(2);
    } catch {
      setError(tp("Сеть недоступна"));
    } finally {
      setVinLoading(false);
    }
  }, [vin, tp]);

  const selectModification = useCallback(
    async (mod: VinModelsResponse["modifications"][0]) => {
      setSelectedMod(mod);
      setVinLoading(true);
      setError(null);
      setEpcRootId("all");
      setEpcQuery("");
      setEpcUnit(null);
      setEpcParts([]);
      setEpcDiagram(null);
      setEpcSubUnits([]);
      setEpcActiveScheme(null);
      setEpcHighlight(null);
      setEpcStatus(null);
      setVinCompare(null);
      setData(null);
      const oemUrl = mod.oemCatalogUrl || vehicleOemCatalog || "";
      if (oemUrl) {
        setVehicleOemCatalog(oemUrl);
        setElcatsEmbedUrl(oemUrl);
      }
      try {
        const qs = new URLSearchParams({ name: mod.name });
        if (mod.path) qs.set("path", mod.path);
        if (oemUrl) qs.set("oemCatalog", oemUrl);

        if (!oemUrl) {
          setError(tp("Нет OEM-каталога для этой модификации"));
          return;
        }

        // Lightweight catalog meta (optional); embed is the real EPC UI
        const res = await fetch(`/api/parts/vin?action=catalog&${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          // Still open embed if we have oem URL
          setVinCatalogData({
            vehiclePath: mod.path || "",
            vehicleName: mod.name,
            groups: [],
            maintenance: [],
          });
          setVinStep(3);
          return;
        }
        setVinCatalogData(json);
        setVinStep(3);
      } catch {
        setError(tp("Сеть недоступна"));
      } finally {
        setVinLoading(false);
      }
    },
    [tp, vehicleOemCatalog]
  );

  const openEpcUnit = useCallback(
    async (
      unit: {
        groupId: string;
        title: string;
        rootTitle?: string;
        navNode?: {
          id: string;
          title: string;
          action: string;
          fields: Record<string, string>;
        };
      },
      opts?: {
        filter?: string;
        unitGuid?: string;
        /** Child scheme nav (must pick one of N schemes — elcats parity) */
        scheme?: {
          unitGuid: string;
          title: string;
          navNode?: { id: string; title: string; action: string; fields: Record<string, string> };
        };
      }
    ) => {
      const oem = selectedMod?.oemCatalogUrl || vehicleOemCatalog;
      if (!oem) return;
      setEpcUnit(unit);
      setEpcPartsLoading(true);
      setEpcHighlight(null);
      // Drill-down: clear previous OEM until new page loads
      setEpcParts([]);
      setEpcDiagram(null);
      if (opts?.scheme) setEpcActiveScheme(opts.scheme.unitGuid);
      else if (!opts?.unitGuid) {
        setEpcActiveScheme(null);
        setEpcSubUnits([]);
      }
      setEpcStatus(
        opts?.scheme
          ? tp("Загрузка выбранной схемы и OEM-кодов…")
          : tp("Загрузка узла EPC (схемы / OEM)…")
      );
      setError(null);
      setVinCompare(null);
      try {
        const qs = new URLSearchParams({
          action: "epc-unit",
          oemCatalog: oem,
          groupId: unit.groupId,
          title: unit.title,
        });
        if (opts?.filter?.trim()) qs.set("filter", opts.filter.trim());
        if (opts?.scheme?.unitGuid || opts?.unitGuid) {
          qs.set("unitGuid", opts.scheme?.unitGuid || opts.unitGuid || "");
        }
        if (opts?.scheme?.title) qs.set("schemeTitle", opts.scheme.title);

        // Prefer exact navNode attached to the unit (unique id). Never match first of many
        // with the same broken groupId.
        const navFromUnit = unit.navNode;
        const navFromCatalog =
          vinCatalog?.oemUnits?.find((u) => u.groupId === unit.groupId && u.title === unit.title)
            ?.navNode ||
          vinCatalog?.oemNavNodes?.find((n) => n.id === unit.groupId) ||
          vinCatalog?.oemNavNodes?.find((n) => n.title === unit.title);

        const parentNav = navFromUnit || navFromCatalog;
        if (parentNav) qs.set("navNode", JSON.stringify(parentNav));

        // Selected scheme / child — open that node exactly (overwrite parent)
        if (opts?.scheme?.navNode) {
          qs.set("navNode", JSON.stringify(opts.scheme.navNode));
          qs.set("childNavNode", JSON.stringify(opts.scheme.navNode));
        }

        const res = await fetch(`/api/parts/vin?${qs.toString()}`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "EPC unit error");
          setEpcParts([]);
          setEpcDiagram(null);
          setEpcSubUnits([]);
          return;
        }
        const parts = (json.parts || []).filter(
          (p: { article?: string; name?: string }) =>
            p.article &&
            p.article !== "—" &&
            !/^цена$/i.test(p.name || "") &&
            !/^NO0+$/i.test(p.article)
        );
        setEpcParts(parts);
        setEpcDiagram(json.diagram || null);
        // Nested drill-down replaces scheme list; keep siblings if leaf has parts
        if (json.subUnits?.length) {
          setEpcSubUnits(json.subUnits);
          if (!(parts.length > 0)) setEpcActiveScheme(null);
        }
        const needScheme = (json.subUnits?.length || 0) > 0 && !(parts.length > 0);
        setEpcStatus(
          json.error && needScheme
            ? json.error
            : needScheme
              ? tp("Выберите схему / подраздел ниже — как на elcats")
              : parts.length
                ? `${parts.length} ${tp("позиций")}` +
                  (json.diagram ? ` · ${tp("схема")}` : "") +
                  ` · ${json.tookMs || 0}ms`
                : json.error || tp("В узле нет позиций для этой модификации")
        );
        setVinStep(4);
      } catch {
        setError(tp("Сеть недоступна"));
      } finally {
        setEpcPartsLoading(false);
      }
    },
    [selectedMod, vehicleOemCatalog, vinCatalog?.oemNavNodes, vinCatalog?.oemUnits, tp]
  );

  const searchEpc = useCallback(async () => {
    const oem = selectedMod?.oemCatalogUrl || vehicleOemCatalog;
    const q = epcQuery.trim();
    if (!oem || q.length < 2) {
      setError(tp("Введите минимум 2 символа для поиска в EPC"));
      return;
    }
    setEpcPartsLoading(true);
    setEpcUnit(null);
    setEpcDiagram(null);
    setEpcSubUnits([]);
    setEpcHighlight(null);
    setEpcStatus(tp("Поиск по узлам и запчастям EPC…"));
    setError(null);
    setVinCompare(null);
    try {
      const qs = new URLSearchParams({
        action: "epc-search",
        oemCatalog: oem,
        q,
      });
      if (epcRootId !== "all") qs.set("rootId", epcRootId);
      const res = await fetch(`/api/parts/vin?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "EPC search error");
        setEpcParts([]);
        return;
      }
      setEpcParts(json.parts || []);
      setEpcStatus(
        `${json.parts?.length || 0} ${tp("найдено")} · ${tp("узлы")}: ${(json.unitsTried || []).length} · ${json.tookMs || 0}ms`
      );
      setVinStep(4);
    } catch {
      setError(tp("Сеть недоступна"));
    } finally {
      setEpcPartsLoading(false);
    }
  }, [selectedMod, vehicleOemCatalog, epcQuery, epcRootId, tp]);

  /** Click OEM part → MD multi-supplier exact search (all open + careful WAF) */
  const searchOemOnMd = useCallback(
    async (article: string, name?: string) => {
      const art = (article || "").trim();
      if (art.length < 3) return;
      setSelectedPartType(art);
      setOnlyExact(true);
      setCode(art);
      setTab("code");
      setVinStep(4);
      setVinCompare({
        vehiclePath: selectedMod?.path || "",
        vehicleName: selectedMod?.name,
        partType: {
          id: art,
          nameRu: name || art,
          nameRo: name || art,
        },
        articles: [art],
        oemParts: [{ article: art, name: name || "" }],
        offers: [],
        vehicleOffers: [],
        bestPrice: null,
        bestSupplier: null,
        inStockCount: 0,
        suppliersOk: 0,
        tookMs: 0,
        explanation: `${tp("Заводской OEM")}: ${art}${name ? ` — ${name}` : ""}. ${tp("Ищем по всем открытым MD-каталогам (ядро → расширенные → WAF аккуратно)…")}`,
        sourceUrl: selectedMod?.oemCatalogUrl || vehicleOemCatalog || undefined,
      });
      await searchCode(art, false);
    },
    [selectedMod, vehicleOemCatalog, searchCode, tp]
  );

  // Elcats embed → postMessage OEM click bridge
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "montatorul-elcats" || d.type !== "oem-search") return;
      const article = String(d.article || "").trim();
      if (article.length < 3) return;
      void searchOemOnMd(article, d.name ? String(d.name) : undefined);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [searchOemOnMd]);

  const filteredEpcUnits = useMemo(() => {
    const units = vinCatalog?.oemUnits || [];
    let list = units;
    if (epcRootId !== "all") {
      list = list.filter((u) => u.rootId === epcRootId || u.rootTitle === epcRootId);
    }
    const q = epcQuery.trim().toLowerCase();
    if (q.length >= 1) {
      list = list.filter(
        (u) =>
          u.title.toLowerCase().includes(q) ||
          (u.rootTitle || "").toLowerCase().includes(q) ||
          u.groupId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [vinCatalog, epcRootId, epcQuery]);

  const activeOffers: PartOffer[] = (data?.offers || vinCompare?.offers || []).filter(
    (o) => !o.isShell && !/^открыть\s+/i.test(o.name || "")
  );
  const bestPrice = data?.bestPrice ?? vinCompare?.bestPrice ?? null;

  const brands = useMemo(
    () => Array.from(new Set(activeOffers.map((o) => o.brand).filter(Boolean))).sort(),
    [activeOffers]
  );
  const supplierNames = useMemo(
    () => Array.from(new Set(activeOffers.map((o) => o.supplierName))).sort(),
    [activeOffers]
  );

  const sortedOffers = useMemo(() => {
    let list = [...activeOffers];
    if (onlyInStock) list = list.filter((o) => o.stock === "in_stock" || o.stock === "order");
    if (onlyExact) list = list.filter((o) => o.matchType === "exact");
    if (brandFilter !== "all") list = list.filter((o) => o.brand === brandFilter);
    if (supplierFilter !== "all") list = list.filter((o) => o.supplierName === supplierFilter);

    list.sort((a, b) => {
      if (sortKey === "match") {
        const mr = (t?: string) => (t === "exact" ? 0 : t === "cross" ? 1 : 2);
        const d = mr(a.matchType) - mr(b.matchType);
        if (d !== 0) return d;
        return (a.price ?? 1e12) - (b.price ?? 1e12);
      }
      if (sortKey === "price") return (a.price ?? 1e12) - (b.price ?? 1e12);
      if (sortKey === "brand") return a.brand.localeCompare(b.brand);
      if (sortKey === "supplier") return a.supplierName.localeCompare(b.supplierName);
      const sr = (s: string) => (s === "in_stock" ? 0 : s === "order" ? 1 : 2);
      return sr(a.stock) - sr(b.stock);
    });
    return list;
  }, [activeOffers, onlyInStock, onlyExact, brandFilter, supplierFilter, sortKey]);

  const filteredMods = useMemo(() => {
    const mods = vinModels?.modifications || [];
    const q = modFilter.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
  }, [vinModels, modFilter]);

  return (
    <div className="space-y-4 sm:space-y-6 pb-4 sm:pb-6">
      {meta && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">{tp("Поставщиков")}: {meta.totals.catalog}</Badge>
          <Badge>{tp("Онлайн-поиск")}: {meta.totals.scrapable}</Badge>
          {(meta.totals.websiteOnly ?? 0) > 0 && (
            <Badge variant="outline">{tp("Сайт без парсера")}: {meta.totals.websiteOnly}</Badge>
          )}
          <Badge variant="outline">{tp("Без каталога")}: {meta.totals.offline}</Badge>
        </div>
      )}

      {sessionRestoredBanner && (data || code || vin) && (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {tp("Восстановлен предыдущий поиск")}
            {code ? ` · ${code}` : vin ? ` · VIN` : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs ml-auto"
            onClick={() => setSessionRestoredBanner(false)}
          >
            {tp("Ок")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={clearSearchSession}
          >
            {tp("Очистить поиск")}
          </Button>
        </div>
      )}

      {/* Basket in document flow — sticky under header, never covers footer/nav */}
      {basketCount > 0 && (
        <div className="sticky top-14 sm:top-16 z-30 -mx-0.5">
          <div className="rounded-xl border border-border bg-background text-foreground shadow-md px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold tabular-nums">
                {tp("Корзина")}: {basketCount}
              </span>
              {orderToast && (
                <span className="text-xs text-muted-foreground truncate max-w-[min(100%,240px)] hidden sm:inline">
                  {orderToast}
                </span>
              )}
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs bg-background"
                  onClick={() => {
                    setBasketOpen(true);
                    refreshBasket();
                  }}
                >
                  {tp("Состав")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => void openDestinationDialog()}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" />
                  {tp("В заказ…")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-9 text-xs"
                  onClick={() => {
                    clearCautpieseBasket();
                    refreshBasket();
                    setOrderToast(null);
                  }}
                  title={tp("Очистить корзину")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main mode tabs */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 -mx-0.5">
        {(
          [
            ["vin", tp("По VIN (для сервиса)"), <Car className="h-4 w-4" key="i" />],
            ["code", tp("По артикулу"), <Tag className="h-4 w-4" key="i" />],
            ["suppliers", tp("Все поставщики"), <Store className="h-4 w-4" key="i" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border-2 text-[11px] sm:text-sm font-semibold uppercase tracking-wider transition-colors min-h-[40px] ${
              tab === id
                ? "bg-primary/10 text-primary border-primary/30"
                : "border-border/60 text-muted-foreground hover:border-primary/20"
            }`}
            style={{ fontFamily: "var(--font-oswald)" }}
          >
            {icon}
            <span className="leading-tight text-left">{label}</span>
          </button>
        ))}
      </div>

      {/* ========== VIN WORKFLOW ========== */}
      {tab === "vin" && (
        <div className="space-y-4">
          <Card className="glass-card border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg uppercase tracking-wide" style={{ fontFamily: "var(--font-oswald)" }}>
                {tp("Поиск запчастей по VIN — все поставщики в одном месте")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {tp(
                  "Вместо 10 вкладок: VIN → модификация авто → тип детали (фильтр, колодки…) → сравнение цен и наличия у молдавских магазинов."
                )}
              </p>

              {/* Steps */}
              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  [1, tp("VIN")],
                  [2, tp("Модификация")],
                  [3, tp("Запчасть")],
                  [4, tp("Цены")],
                ].map(([n, label]) => (
                  <div
                    key={n}
                    className={`px-3 py-1.5 rounded-full border ${
                      vinStep === n
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : vinStep > (n as number)
                          ? "border-green-600/40 text-green-700 dark:text-green-400"
                          : "border-border text-muted-foreground"
                    }`}
                  >
                    {n}. {label}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label>VIN</Label>
                  <Input
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && void decodeVin()}
                    placeholder="KNEFE… / UU1LS… / WVWZZZ… / VF1…"
                    className="h-12 font-mono tracking-widest uppercase"
                    maxLength={17}
                  />
                </div>
                <div className="flex sm:items-end">
                  <Button className="btn-garage h-12 px-6 w-full sm:w-auto" disabled={vinLoading} onClick={() => void decodeVin()}>
                    {vinLoading && vinStep <= 2 ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Car className="h-5 w-5 mr-2" />}
                    {tp("Определить авто")}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {tp(
                  "Европейские/азиатские VIN (Kia, Dacia, Skoda…) часто не в базе США — марка определяется по WMI, модель выбираете из каталога Молдовы."
                )}
              </p>
            </CardContent>
          </Card>

          {/* Step 2: modifications */}
          {vinModels && vinStep >= 2 && (
            <Card className="glass-card border-border/80">
              <CardContent className="pt-5 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="secondary" className="font-mono">{vinModels.vehicle.vin}</Badge>
                  {vinModels.vehicle.make && <Badge>{vinModels.vehicle.make}</Badge>}
                  {vinModels.vehicle.model && <Badge variant="outline">{vinModels.vehicle.model}</Badge>}
                  {vinModels.vehicle.modelYear && <Badge variant="outline">{vinModels.vehicle.modelYear}</Badge>}
                  {vinModels.vehicle.productionDate && (
                    <Badge variant="outline">{tp("выпуск")} {vinModels.vehicle.productionDate}</Badge>
                  )}
                  {vinModels.vehicle.engine && (
                    <span className="text-xs text-muted-foreground">{vinModels.vehicle.engine}</span>
                  )}
                  {vinModels.vehicle.transmission && (
                    <span className="text-xs text-muted-foreground">{vinModels.vehicle.transmission}</span>
                  )}
                </div>
                {vinModels.vehicle.error && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 break-all">
                    {vinModels.vehicle.error}
                  </div>
                )}
                <div>
                  <Label className="text-sm">{tp("Выберите точную модификацию (двигатель / кузов)")}</Label>
                  <Input
                    className="mt-1.5 h-10"
                    placeholder={
                      vinModels.vehicle.make?.toUpperCase() === "KIA"
                        ? tp("Фильтр: cerato, diesel, 1.6…")
                        : tp("Фильтр: logan 1.5, dci…")
                    }
                    value={modFilter}
                    onChange={(e) => setModFilter(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {tp("Найдено модификаций")}: {filteredMods.length}
                    {vinModels.vehicle.make ? ` · ${vinModels.vehicle.make}` : ""}
                    {vinModels.vehicle.modelYear ? ` · ${vinModels.vehicle.modelYear}` : ""}
                    {vinModels.vehicle.raw?.CatcarSource ? ` · OEM VIN` : ""}
                  </p>
                </div>
                {vinLoading && vinStep === 2 && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> {tp("Загрузка каталога…")}
                  </div>
                )}
                <div className="max-h-64 overflow-y-auto space-y-1.5 border border-border/50 rounded-xl p-2">
                  {filteredMods.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">
                      {tp("Модификации не найдены в открытом каталоге. Проверьте марку/модель или ищите по артикулу.")}
                    </p>
                  ) : (
                    filteredMods.map((mod) => (
                      <div key={mod.id} className="flex items-stretch gap-1">
                        <button
                          type="button"
                          onClick={() => void selectModification(mod)}
                          className={`flex-1 text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                            selectedMod?.id === mod.id
                              ? "border-primary bg-primary/10"
                              : "border-transparent hover:bg-muted/40"
                          }`}
                        >
                          <span className="text-sm font-medium">
                            {mod.name}
                            {(mod.source === "catcar" || mod.source === "elcats") && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">OEM</span>
                            )}
                          </span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </button>
                        {mod.oemCatalogUrl && (
                          <a
                            href={mod.oemCatalogUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 px-2 rounded-lg border border-border/60 text-[11px] text-muted-foreground hover:bg-muted/40 flex items-center"
                            title="OEM catalog"
                          >
                            EPC
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {tp("Только OEM EPC (elcats). Дальше: категории и узлы завода → OEM-код → цены MD строго по этому коду.")}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Step 3: elcats embed (working catalog inside the app) */}
          {vinCatalog && vinStep >= 3 && (
            <Card className="glass-card border-border/80 overflow-hidden">
              <CardContent className="pt-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm space-y-1 min-w-0">
                    <div>
                      <Wrench className="h-4 w-4 inline mr-1.5 text-primary" />
                      <strong>{selectedMod?.name || vinCatalog.vehicleName}</strong>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tp(
                        "Живой каталог elcats внутри программы. Клик по OEM / выноске на схеме → поиск цен у MD-поставщиков."
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {(selectedMod?.oemCatalogUrl || vehicleOemCatalog) && (
                      <a
                        href={selectedMod?.oemCatalogUrl || vehicleOemCatalog}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border/60 hover:border-primary/40"
                      >
                        elcats.ru <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const u = selectedMod?.oemCatalogUrl || vehicleOemCatalog;
                        if (u) setElcatsEmbedUrl(u);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      {tp("В корень каталога")}
                    </Button>
                  </div>
                </div>

                {(selectedMod?.oemCatalogUrl || vehicleOemCatalog)?.includes("elcats.ru") ? (
                  <div className="rounded-xl border border-border/80 overflow-hidden bg-card shadow-sm">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-muted/40 text-[11px] text-muted-foreground">
                      <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                      <span className="font-medium text-foreground/80 shrink-0">
                        {tp("Каталог завода")}
                      </span>
                      <span className="truncate opacity-70 font-mono text-[10px] sm:text-[11px]">
                        {(elcatsEmbedUrl || selectedMod?.oemCatalogUrl || vehicleOemCatalog || "").replace(
                          /^https?:\/\/www\.elcats\.ru/i,
                          ""
                        )}
                      </span>
                    </div>
                    <iframe
                      title="elcats-epc"
                      key={elcatsEmbedUrl || selectedMod?.oemCatalogUrl || vehicleOemCatalog}
                      src={
                        "/api/parts/elcats-embed?url=" +
                        encodeURIComponent(
                          elcatsEmbedUrl || selectedMod?.oemCatalogUrl || vehicleOemCatalog || ""
                        )
                      }
                      className="w-full border-0 bg-background dark:bg-[#121212]"
                      style={{
                        height: "min(82vh, 960px)",
                        minHeight: "min(60vh, 520px)",
                      }}
                      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-200">
                    {tp(
                      "Для этой модификации нет elcats OEM-ссылки. Откройте внешний каталог или ищите по артикулу."
                    )}
                    {(selectedMod?.oemCatalogUrl || vehicleOemCatalog) && (
                      <a
                        href={selectedMod?.oemCatalogUrl || vehicleOemCatalog}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-primary"
                      >
                        {tp("Открыть каталог")} <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground">
                  {tp(
                    "Навигация 1:1 как на elcats (категории, схемы, выноски). Клик по коду детали запускает наш MD-поиск."
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========== ARTICLE SEARCH ========== */}
      {tab === "code" && (
        <Card className="glass-card border-border/80 overflow-visible">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg uppercase tracking-wide" style={{ fontFamily: "var(--font-oswald)" }}>
              {tp("Сравнение по артикулу")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 overflow-visible">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground flex gap-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                {tp(
                  "Если ввести OC90, магазины вернут и точный Knecht/Mahle OC90, и аналоги (FEBI 32122, FILTRON…). Это кросс-номера TecDoc — та же деталь, другой бренд. В таблице: «Точный код» vs «Аналог»."
                )}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1.5" ref={codeInputWrapRef}>
                <Label>{tp("Код / OEM / кросс")}</Label>
                <Input
                  ref={codeInputRef}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeSuggestOpen(true);
                  }}
                  onFocus={() => {
                    setCodeSuggestOpen(true);
                    requestAnimationFrame(updateSuggestBox);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCodeSuggestOpen(false);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void searchCode();
                    }
                  }}
                  placeholder="OC90, W712/75, GDB199…"
                  className="h-12 font-mono"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={codeSuggestOpen && codeSuggestions.length > 0}
                  aria-autocomplete="list"
                />
                {typeof document !== "undefined" &&
                  codeSuggestOpen &&
                  codeSuggestions.length > 0 &&
                  suggestBox &&
                  createPortal(
                    <div
                      id="cautpiese-code-suggest-portal"
                      role="listbox"
                      className="fixed z-[200] rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/10 overflow-hidden"
                      style={{
                        top: suggestBox.top,
                        left: suggestBox.left,
                        width: suggestBox.width,
                      }}
                    >
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-muted/50">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {code.trim()
                            ? tp("Из недавних")
                            : tp("Недавние запросы")}
                        </span>
                        {!code.trim() && recentQueries.length > 0 && (
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              clearRecentQueries();
                              setRecentQueries([]);
                            }}
                          >
                            {tp("Очистить")}
                          </button>
                        )}
                      </div>
                      <ul className="max-h-56 overflow-y-auto py-1">
                        {codeSuggestions.map((q) => (
                          <li key={q} role="option">
                            <button
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted font-mono"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setCode(q);
                                setCodeSuggestOpen(false);
                                void searchCode(q);
                              }}
                            >
                              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1 truncate">{q}</span>
                              <span
                                role="button"
                                tabIndex={-1}
                                className="p-1 rounded text-muted-foreground hover:text-destructive"
                                title={tp("Удалить из истории")}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRecentQueries(removeRecentQuery(q));
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>,
                    document.body
                  )}
              </div>
              <div className="flex gap-2 sm:items-end">
                <Button className="btn-garage h-12 px-6" disabled={loading} onClick={() => void searchCode()}>
                  {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Search className="h-5 w-5 mr-2" />}
                  {tp("Найти у всех")}
                </Button>
                <Button variant="outline" className="h-12 px-3" disabled={loading || !data} onClick={() => void searchCode(undefined, true)}>
                  <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "suppliers" && meta && (
        <Card className="glass-card border-border/80">
          <CardHeader>
            <CardTitle className="text-lg uppercase" style={{ fontFamily: "var(--font-oswald)" }}>
              {tp("Все поставщики Молдовы")} ({meta.allSuppliers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {meta.allSuppliers.map((s) => {
                const status = s.status || (s.online ? "online" : s.website ? "website" : "offline");
                const badgeLabel =
                  status === "online"
                    ? tp("онлайн")
                    : status === "website"
                      ? tp("сайт")
                      : tp("офлайн");
                return (
                <div key={s.id} className="rounded-xl border border-border/60 p-3 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-sm">{s.name}</span>
                    <Badge
                      variant={status === "online" ? "default" : "outline"}
                      className="text-[10px]"
                      title={
                        status === "online"
                          ? tp("Автопоиск цен")
                          : status === "website"
                            ? tp("Есть сайт, парсера цен пока нет / WAF")
                            : tp("Нет публичного каталога")
                      }
                    >
                      {badgeLabel}
                    </Badge>
                  </div>
                  {s.city && <div className="text-xs text-muted-foreground">{s.city}</div>}
                  {s.notes && <div className="text-[11px] text-muted-foreground/80">{s.notes}</div>}
                  {s.website && (
                    <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                      {tp("Сайт")} <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm flex gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Basket contents */}
      <Dialog open={basketOpen} onOpenChange={setBasketOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {tp("Корзина")}: {basketItems.length}
            </DialogTitle>
            <DialogDescription>
              {tp("Позиции из поиска. Дальше выберите новый или существующий заказ.")}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {basketItems.length === 0 && (
              <li className="text-muted-foreground text-xs">{tp("Пусто")}</li>
            )}
            {basketItems.map((item) => (
              <li
                key={item.tempId || item.name}
                className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium line-clamp-2">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[item.brand, item.code, item.supplier_name].filter(Boolean).join(" · ")}
                    {item.selling_price > 0
                      ? ` · ${item.selling_price.toFixed(2)} MDL`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive p-1"
                  onClick={() => {
                    if (item.tempId) removeCautpieseBasketItem(item.tempId);
                    refreshBasket();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setBasketOpen(false)}>
              {tp("Закрыть")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setBasketOpen(false);
                void openDestinationDialog();
              }}
              disabled={basketItems.length === 0}
            >
              {tp("В заказ…")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Destination: drafts/open first, then recent closed */}
      <Dialog open={destOpen} onOpenChange={setDestOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tp("Куда добавить запчасти?")}</DialogTitle>
            <DialogDescription>
              {tp("В корзине")}: {basketCount}.{" "}
              {tp("Сначала открытые и черновики, ниже — недавние заказы.")}
            </DialogDescription>
          </DialogHeader>

          <Input
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
            placeholder={tp("Клиент, номер, авто, VIN…")}
            className="h-10"
          />

          {ordersLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tp("Загрузка заказов…")}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1) Local draft + new order */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tp("Черновик / новый")}
                </div>
                {newOrderDraftPreview && (
                  <button
                    type="button"
                    onClick={goNewOrder}
                    className="w-full text-left rounded-lg border-2 border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10 px-3 py-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="text-[10px] bg-amber-600 hover:bg-amber-600">
                        {tp("Черновик")}
                      </Badge>
                      <span className="font-medium text-sm">
                        {tp("Продолжить незавершённый заказ")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {newOrderDraftPreview.items > 0
                        ? `${newOrderDraftPreview.items} ${tp("позиций")}`
                        : tp("Без позиций")}
                      {newOrderDraftPreview.savedAt
                        ? ` · ${newOrderDraftPreview.savedAt}`
                        : ""}
                    </div>
                  </button>
                )}
                <Button type="button" className="w-full h-10" variant="default" onClick={goNewOrder}>
                  <Plus className="h-4 w-4 mr-2" />
                  {tp("Новый заказ")}
                </Button>
              </div>

              {/* 2) Open orders */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tp("Открытые заказы")} ({openOrdersList.length})
                </div>
                {openOrdersList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {tp("Нет заказов со статусом Новый / В работе / Готов.")}
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-[28vh] overflow-y-auto">
                    {openOrdersList.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => goExistingOrder(o.id)}
                          className="w-full text-left rounded-lg border border-border bg-background hover:border-primary/50 hover:bg-muted/40 px-3 py-2.5 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={o.status === "Новый" ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {o.status}
                            </Badge>
                            <span className="font-medium text-sm">
                              {o.client?.full_name || "—"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[o.car?.brand, o.car?.model, o.car?.license_plate]
                              .filter(Boolean)
                              .join(" · ") || tp("Авто не указано")}
                            {" · "}
                            {(o.total_amount ?? 0).toFixed(0)} MDL
                            {" · "}
                            {o.order_date?.slice(0, 10)}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 3) Recent closed / other */}
              {recentOrdersList.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {tp("Недавние (закрытые)")} ({recentOrdersList.length})
                  </div>
                  <ul className="space-y-1.5 max-h-[22vh] overflow-y-auto">
                    {recentOrdersList.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => goExistingOrder(o.id)}
                          className="w-full text-left rounded-lg border border-border/80 bg-muted/20 hover:bg-muted/40 px-3 py-2.5 transition-colors"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">
                              {o.status}
                            </Badge>
                            <span className="font-medium text-sm">
                              {o.client?.full_name || "—"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[o.car?.brand, o.car?.model, o.car?.license_plate]
                              .filter(Boolean)
                              .join(" · ") || tp("Авто не указано")}
                            {" · "}
                            {(o.total_amount ?? 0).toFixed(0)} MDL
                            {" · "}
                            {o.order_date?.slice(0, 10)}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDestOpen(false)}>
              {tp("Отмена")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== RESULTS (code or VIN compare) ========== */}
      {(data || vinCompare) && tab !== "suppliers" && (
        <div className="space-y-4">
          {(data?.explanation || vinCompare?.explanation) && (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm flex gap-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>{data?.explanation || vinCompare?.explanation}</span>
              {expanding && (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {tp("Догрузка магазинов…")}
                </span>
              )}
            </div>
          )}

          {/* Always-on MD deep-links — browser parity even when prices exist */}
          {data?.shopLinks && data.shopLinks.length > 0 && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {tp("Прямые ссылки на поиск у поставщиков MD")}
                <span className="ml-2 font-normal normal-case opacity-80 text-muted-foreground">
                  ({tp("как в браузере — откройте магазин, если цены/наличие не подтянулись")})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.shopLinks.map((l) => (
                  <a
                    key={l.supplier}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-primary/5 text-foreground"
                  >
                    <Store className="h-3 w-3 text-primary" />
                    {l.supplierName}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {vinCompare && (
            <div className="text-sm space-y-1">
              <div>
                <strong>{vinCompare.vehicleName || selectedMod?.name}</strong>
                {" · "}
                {isRo ? vinCompare.partType.nameRo : vinCompare.partType.nameRu}
                {" · "}
                {vinCompare.tookMs}ms
              </div>
              {(vinCompare.oemParts?.length || vinCompare.articles.length > 0) && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                    {tp("Заводские OEM (только эти коды ищутся в MD — без «аналогов»)")}
                  </div>
                  <ul className="space-y-1.5">
                    {(vinCompare.oemParts?.length
                      ? vinCompare.oemParts
                      : vinCompare.articles.map((a) => ({ article: a, name: "" }))
                    ).map((p) => (
                      <li key={p.article} className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge
                          variant="default"
                          className="font-mono text-[11px] cursor-pointer"
                          onClick={() => {
                            setCode(p.article);
                            setTab("code");
                          }}
                        >
                          {p.article}
                        </Badge>
                        {p.name && (
                          <span className="text-xs text-muted-foreground">{p.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {vinCompare.sourceUrl && (
                <a href={vinCompare.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1">
                  {tp("Источник каталога по авто")} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {tp("нормализовано")}: <code className="font-mono">{data.normalized}</code>
                {" · "}
                {data.exactOffers?.length || 0} {tp("точных")} / {data.crossOffers?.length || 0} {tp("аналогов")}
                {" · "}
                {data.tookMs}ms · {data.suppliersOk}/{data.suppliersTotal}
              </span>
              {data.cached && (
                <Badge variant="outline" className="text-[10px]">
                  {tp("из кэша")}
                  {data.cachedAt
                    ? ` · ${Math.max(0, Math.round((Date.now() - data.cachedAt) / 60000))} ${tp("мин")}`
                    : ""}
                </Badge>
              )}
              {data.phase === "core" && expanding && (
                <Badge variant="secondary" className="text-[10px]">
                  {tp("ядро")}
                </Badge>
              )}
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs ml-auto" onClick={copyQuote}>
                <ClipboardCopy className="h-3 w-3 mr-1" />
                {tp("Скопировать сравнение")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDiagOpen((v) => !v)}
              >
                {tp("Магазины")} ({data.results?.length || 0})
              </Button>
            </div>
          )}

          {data && diagOpen && data.results?.length > 0 && (
            <div className="rounded-xl border border-border/60 p-3 space-y-1.5 text-xs">
              <div className="font-medium text-sm mb-1">{tp("Диагностика магазинов")}</div>
              {data.results.map((r) => {
                const priced = r.offers.filter((o) => o.price != null && o.price > 0).length;
                let status = "ok";
                let label = `✅ ${priced} ${tp("цен")} · ${r.durationMs}ms`;
                if (r.blocked) {
                  status = "blocked";
                  label = `⚠ WAF/блок · ${r.durationMs}ms`;
                } else if (!r.ok) {
                  status = "err";
                  label = `✕ ${r.error || "ошибка"} · ${r.durationMs}ms`;
                } else if (priced === 0) {
                  status = "empty";
                  label = `⊘ 0 ${tp("цен")} · ${r.error || tp("страница открыта")} · ${r.durationMs}ms`;
                }
                return (
                  <div
                    key={r.supplier}
                    className={`flex flex-wrap items-center gap-2 py-1 border-b border-border/40 last:border-0 ${
                      status === "blocked" || status === "err" ? "text-amber-700 dark:text-amber-400" : ""
                    }`}
                  >
                    <span className="font-medium min-w-[120px]">{r.supplierName}</span>
                    <span className="text-muted-foreground flex-1">{label}</span>
                    {meta?.allSuppliers.find((s) => s.id === r.supplier)?.website && (
                      <a
                        href={meta.allSuppliers.find((s) => s.id === r.supplier)!.website!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary inline-flex items-center gap-0.5"
                      >
                        {tp("Сайт")} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {bestPrice != null && (
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex flex-wrap items-center gap-3">
              <Trophy className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">
                  {tp("Лучшая цена")}:{" "}
                  <span className="text-primary text-xl tabular-nums">{formatMoney(bestPrice)} MDL</span>
                </div>
                {data?.bestExactPrice != null && data.bestExactPrice !== bestPrice && (
                  <div className="text-xs text-muted-foreground">
                    {tp("Лучшая среди точных кодов")}: {formatMoney(data.bestExactPrice)} MDL
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {tp("Только доверенные MDL-цены из карточек магазинов")}
                </div>
              </div>
              <Badge variant="secondary" className="ml-auto">
                <Package className="h-3 w-3 mr-1" />
                {tp("С наличием")}: {data?.inStockCount ?? vinCompare?.inStockCount}
              </Badge>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-end flex-wrap">
            <div className="space-y-1.5 min-w-0 sm:min-w-[140px] flex-1 sm:flex-initial">
              <Label>{tp("Магазин")}</Label>
              <Select value={supplierFilter} onValueChange={(v) => setSupplierFilter(v || "all")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tp("Все магазины")}</SelectItem>
                  {supplierNames.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[120px]">
              <Label>{tp("Бренд")}</Label>
              <Select value={brandFilter} onValueChange={(v) => setBrandFilter(v || "all")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tp("Все бренды")}</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[140px]">
              <Label><ArrowDownUp className="h-3.5 w-3.5 inline mr-1" />{tp("Сортировка")}</Label>
              <Select value={sortKey} onValueChange={(v) => setSortKey((v as SortKey) || "match")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="match">{tp("Точность → цена")}</SelectItem>
                  <SelectItem value="price">{tp("По цене")}</SelectItem>
                  <SelectItem value="stock">{tp("По наличию")}</SelectItem>
                  <SelectItem value="brand">{tp("По бренду")}</SelectItem>
                  <SelectItem value="supplier">{tp("По магазину")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-border/60 text-sm cursor-pointer">
              <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} className="accent-[var(--primary)]" />
              {tp("Только наличие / заказ")}
            </label>
            <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-border/60 text-sm cursor-pointer">
              <input type="checkbox" checked={onlyExact} onChange={(e) => setOnlyExact(e.target.checked)} className="accent-[var(--primary)]" />
              {tp("Только точный код")}
            </label>
          </div>

          {sortedOffers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-xl space-y-2">
              <div>
                {activeOffers.length > 0
                  ? tp("Фильтры скрыли все строки — сбросьте «Только точный» / наличие")
                  : tp("Нет предложений")}
              </div>
              {data && (data.results?.some((r) => r.blocked || !r.ok) || data.suppliersOk === 0) && (
                <button type="button" className="text-primary text-sm underline" onClick={() => setDiagOpen(true)}>
                  {tp("Почему пусто? Откройте диагностику магазинов")}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-left">
                    <tr className="uppercase tracking-wider text-xs" style={{ fontFamily: "var(--font-oswald)" }}>
                      <th className="px-3 py-3">{tp("Тип")}</th>
                      <th className="px-3 py-3">{tp("Магазин")}</th>
                      <th className="px-3 py-3">{tp("Бренд")}</th>
                      <th className="px-3 py-3">{tp("Артикул")}</th>
                      <th className="px-3 py-3">{tp("Название")}</th>
                      <th className="px-3 py-3 text-right">{tp("Цена")}</th>
                      <th className="px-3 py-3">{tp("Наличие")}</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOffers.map((o, i) => (
                      <OfferRow
                        key={`${o.supplier}-${o.article}-${i}`}
                        offer={o}
                        best={bestPrice}
                        isRo={isRo}
                        onAdd={() => addOfferToOrder(o)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-3">
                {sortedOffers.map((o, i) => (
                  <OfferCard
                    key={`${o.supplier}-${o.article}-${i}`}
                    offer={o}
                    best={bestPrice}
                    isRo={isRo}
                    onAdd={() => addOfferToOrder(o)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatMoney(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function OfferRow({
  offer,
  best,
  isRo,
  onAdd,
}: {
  offer: PartOffer;
  best: number | null;
  isRo: boolean;
  onAdd?: () => void;
}) {
  const isBest =
    offer.price != null &&
    best != null &&
    offer.price === best &&
    !offer.isShell &&
    (!offer.currency || /^(MDL|L|LEI|LEU)$/i.test(offer.currency));
  const stock = STOCK_LABEL[offer.stock] || STOCK_LABEL.unknown;
  const match = MATCH_LABEL[offer.matchType || "cross"] || MATCH_LABEL.cross;
  return (
    <tr className={`border-t border-border/50 ${isBest ? "bg-primary/5" : "hover:bg-muted/20"}`}>
      <td className="px-3 py-2.5">
        <Badge variant={match.variant} className="text-[10px]">
          {isRo ? match.ro : match.ru}
        </Badge>
      </td>
      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{offer.supplierName}</td>
      <td className="px-3 py-2.5">{offer.brand}</td>
      <td className="px-3 py-2.5 font-mono text-xs">{offer.article}</td>
      <td className="px-3 py-2.5 max-w-[240px]"><span className="line-clamp-2">{offer.name}</span></td>
      <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${isBest ? "text-primary" : ""}`}>
        {offer.price != null ? (
          <>
            {isBest && <Trophy className="h-3.5 w-3.5 inline mr-1 text-primary" />}
            {formatMoney(offer.price)} {offer.currency}
          </>
        ) : offer.rawPriceText ? (
          <span className="text-xs font-medium text-muted-foreground">{offer.rawPriceText}</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2.5">
        <Badge variant={offer.stock === "in_stock" ? "default" : "secondary"} className="text-[10px]">
          {isRo ? stock.ro : stock.ru}
        </Badge>
        {offer.delivery && <div className="text-[10px] text-muted-foreground mt-0.5">{offer.delivery}</div>}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-primary text-xs inline-flex items-center gap-1 mr-2 hover:underline"
            title={isRo ? "În comandă" : "В заказ"}
          >
            <Plus className="h-3 w-3" />
            {isRo ? "În coș" : "В корзину"}
          </button>
        )}
        {offer.url && (
          <a href={offer.url} target="_blank" rel="noopener noreferrer" className="text-primary text-xs inline-flex items-center gap-1">
            {isRo ? "Deschide" : "Открыть"} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </td>
    </tr>
  );
}

function OfferCard({
  offer,
  best,
  isRo,
  onAdd,
}: {
  offer: PartOffer;
  best: number | null;
  isRo: boolean;
  onAdd?: () => void;
}) {
  const isBest =
    offer.price != null &&
    best != null &&
    offer.price === best &&
    !offer.isShell &&
    (!offer.currency || /^(MDL|L|LEI|LEU)$/i.test(offer.currency));
  const stock = STOCK_LABEL[offer.stock] || STOCK_LABEL.unknown;
  const match = MATCH_LABEL[offer.matchType || "cross"] || MATCH_LABEL.cross;
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${isBest ? "border-primary/40 bg-primary/5" : "border-border/70"}`}>
      <div className="flex justify-between gap-2">
        <Badge variant={match.variant} className="text-[10px]">{isRo ? match.ro : match.ru}</Badge>
        <div className={`font-bold tabular-nums ${isBest ? "text-primary" : ""}`}>
          {offer.price != null
            ? `${formatMoney(offer.price)} ${offer.currency}`
            : offer.rawPriceText || "—"}
        </div>
      </div>
      <div className="font-semibold">{offer.brand} <span className="font-mono text-xs text-muted-foreground">{offer.article}</span></div>
      <div className="text-sm line-clamp-2">{offer.name}</div>
      <div className="flex flex-wrap gap-2 text-xs items-center">
        <Badge variant="outline">{offer.supplierName}</Badge>
        <Badge variant={offer.stock === "in_stock" ? "default" : "secondary"}>{isRo ? stock.ro : stock.ru}</Badge>
        {onAdd && (
          <button type="button" onClick={onAdd} className="text-primary inline-flex items-center gap-1">
            <Plus className="h-3 w-3" />
            {isRo ? "În coș" : "В корзину"}
          </button>
        )}
        {offer.url && (
          <a href={offer.url} target="_blank" rel="noopener noreferrer" className="text-primary ml-auto inline-flex items-center gap-1">
            {isRo ? "Deschide" : "Открыть"} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
