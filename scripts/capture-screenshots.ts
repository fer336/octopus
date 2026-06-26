/**
 * Capture screenshots of OctopusTrack for the promo video.
 *
 * Auth bypass: injects Zustand auth state into localStorage — same technique
 * used by the E2E auth helper (frontend/e2e/helpers/auth.ts).
 *
 * API bypass: intercepts all requests to the backend and returns mock data,
 * so the capture works without a running backend.
 *
 * Usage:
 *   1. Start the frontend dev server: cd frontend && npm run dev
 *   2. From project root: npx tsx scripts/capture-screenshots.ts
 */

import { chromium, Page, Route } from "playwright";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = "http://localhost:5173/tenant.html";
const OUT_DIR = path.resolve(__dirname, "../video/public/screenshots");

const VIEWPORT = { width: 1440, height: 900 };

// Auth state injected into localStorage — bypasses Google OAuth entirely
const MOCK_AUTH_STATE = {
  state: {
    accessToken: "demo-token-for-screenshots",
    refreshToken: "",
    isAuthenticated: true,
    user: {
      id: "demo-user",
      email: "demo@octopustrack.ar",
      name: "Demo Store",
      platform_role: "tenant_user",
      membership_role: "owner",
      module_permissions: {},
    },
  },
  version: 0,
};

// ─── Mock API Responses ───────────────────────────────────────────────────────

function mockDashboard() {
  return {
    total_products: 248,
    total_clients: 73,
    low_stock_products: 5,
    total_value: 4820000,
    total_sales: 312,
    total_invoices: 89,
    today_sales: 14,
    today_invoiced: 3,
    today_vouchers_count: 3,
    cash_income: 1240000,
    paid_invoices: 67,
    paid_stockpiles: 12,
    current_account_collected: 380000,
    pending_customer_balance: 92000,
    other_income: 45000,
    closed_current_accounts: 8,
    closed_current_accounts_total: 120000,
    filter_month: 6,
    filter_year: 2026,
    filter_date_from: "2026-06-01",
    filter_date_to: "2026-06-30",
  };
}

function mockTrend() {
  return [
    { month: 1, year: 2026, label: "Ene", cash_income: 980000, total_sales: 210, pending_customer_balance: 45000 },
    { month: 2, year: 2026, label: "Feb", cash_income: 1100000, total_sales: 245, pending_customer_balance: 52000 },
    { month: 3, year: 2026, label: "Mar", cash_income: 1050000, total_sales: 228, pending_customer_balance: 38000 },
    { month: 4, year: 2026, label: "Abr", cash_income: 1320000, total_sales: 290, pending_customer_balance: 61000 },
    { month: 5, year: 2026, label: "May", cash_income: 1180000, total_sales: 265, pending_customer_balance: 74000 },
    { month: 6, year: 2026, label: "Jun", cash_income: 1240000, total_sales: 312, pending_customer_balance: 92000 },
  ];
}

function mockProducts() {
  const products = Array.from({ length: 20 }, (_, i) => ({
    id: `prod-${i}`,
    business_id: "biz-1",
    code: `COD-${String(i + 1).padStart(3, "0")}`,
    description: ["Pintura látex blanco mate 4L", "Esmalte sintético gris 1L", "Barniz brillante 750ml", "Impermeabilizante 5kg", "Fijador universal 1L", "Diluyente nitro 1L", "Pintura exterior 20L"][i % 7],
    list_price: [4200, 2800, 3600, 8900, 1800, 1200, 18500][i % 7],
    cost_price: [2800, 1900, 2400, 6200, 1200, 800, 12800][i % 7],
    current_stock: [24, 8, 15, 3, 42, 18, 6][i % 7],
    minimum_stock: 5,
    price_currency: "ARS",
    discount_1: 0,
    discount_2: 0,
    discount_3: 0,
    extra_cost: 0,
    profit_margin: 30,
    net_price: [4200, 2800, 3600, 8900, 1800, 1200, 18500][i % 7],
    sale_price: [4200, 2800, 3600, 8900, 1800, 1200, 18500][i % 7],
    iva_rate: 21,
    is_active: true,
  }));
  return { items: products, total: 248, page: 1, page_size: 20 };
}

function mockClients() {
  const clients = Array.from({ length: 12 }, (_, i) => ({
    id: `client-${i}`,
    business_id: "biz-1",
    name: ["Constructora Norte SA", "Pinturería El Toro", "Obras Viales SRL", "Reformas Mendez", "Decoraciones Luna", "Refaccionaria Oeste"][i % 6],
    email: `cliente${i}@ejemplo.com`,
    phone: `+54 9 11 ${4000 + i * 111}-${5000 + i * 77}`,
    address: `Av. Corrientes ${1000 + i * 123}, CABA`,
    cuit: `20-${30000000 + i * 1111}-${i % 10}`,
    credit_limit: 500000,
    current_balance: (i % 3 === 0 ? -1 : 1) * 45000 * (i + 1),
    client_type: i % 3 === 0 ? "empresa" : "particular",
    is_active: true,
  }));
  return { items: clients, total: 73, page: 1, page_size: 20 };
}

function mockSales() {
  const sales = Array.from({ length: 15 }, (_, i) => ({
    id: `sale-${i}`,
    business_id: "biz-1",
    number: 1000 + i,
    created_at: new Date(Date.now() - i * 86400000).toISOString(),
    client_name: ["Constructora Norte", "Pinturería El Toro", "Particular", "Reformas Mendez"][i % 4],
    total: [12400, 8900, 4200, 21000, 6700, 15300][i % 6],
    status: i % 4 === 0 ? "pending" : "completed",
    payment_method: ["efectivo", "transferencia", "cuenta corriente"][i % 3],
    items_count: (i % 5) + 1,
  }));
  return { items: sales, total: 312, page: 1, page_size: 20 };
}

function mockInventory() {
  return Array.from({ length: 18 }, (_, i) => ({
    id: `inv-${i}`,
    product_id: `prod-${i}`,
    product_code: `COD-${String(i + 1).padStart(3, "0")}`,
    product_description: ["Pintura látex blanco mate 4L", "Esmalte sintético gris 1L", "Barniz brillante 750ml", "Impermeabilizante 5kg", "Fijador universal 1L"][i % 5],
    current_stock: [24, 8, 15, 3, 42][i % 5],
    minimum_stock: 5,
    unit_cost: [2800, 1900, 2400, 6200, 1200][i % 5],
    total_value: [24, 8, 15, 3, 42][i % 5] * [2800, 1900, 2400, 6200, 1200][i % 5],
    status: [24, 8, 15, 3, 42][i % 5] <= 5 ? "low_stock" : "ok",
  }));
}

function mockCash() {
  return {
    current_session: {
      id: "session-1",
      opened_at: new Date(Date.now() - 4 * 3600000).toISOString(),
      initial_amount: 50000,
      current_balance: 187400,
      total_income: 137400,
      total_expense: 0,
      transactions_count: 14,
      status: "open",
    },
    sessions: Array.from({ length: 5 }, (_, i) => ({
      id: `sess-${i}`,
      opened_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      closed_at: new Date(Date.now() - (i + 1) * 86400000 + 8 * 3600000).toISOString(),
      initial_amount: 50000,
      final_amount: 180000 + i * 12000,
      status: "closed",
    })),
  };
}

function mockBusiness() {
  return {
    id: "biz-1",
    name: "Demo Store",
    email: "demo@octopustrack.ar",
    phone: "+54 9 11 1234-5678",
    address: "Av. Corrientes 1234, CABA",
    logo_url: null,
    currency: "ARS",
    plan: "pro",
  };
}

// ─── Route Interceptor ────────────────────────────────────────────────────────

async function setupApiMocks(page: Page) {
  await page.route("**/*", async (route: Route) => {
    const url = route.request().url();

    // Pass through non-API requests
    if (!url.includes("/api/")) {
      await route.continue();
      return;
    }

    const respond = (data: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

    if (url.includes("/auth/me")) return respond(MOCK_AUTH_STATE.state.user);
    if (url.includes("/dashboard/summary")) return respond(mockDashboard());
    if (url.includes("/dashboard/trend")) return respond(mockTrend());
    if (url.includes("/products") && !url.includes("/stockpile")) return respond(mockProducts());
    if (url.includes("/clients")) return respond(mockClients());
    if (url.includes("/sales") && !url.includes("/stockpile")) return respond(mockSales());
    if (url.includes("/inventory") || url.includes("/stockpile")) return respond(mockInventory());
    if (url.includes("/cash")) return respond(mockCash());
    if (url.includes("/business")) return respond(mockBusiness());
    if (url.includes("/categories")) return respond({ items: [], total: 0 });
    if (url.includes("/brands")) return respond({ items: [], total: 0 });
    if (url.includes("/payment-methods")) return respond([]);
    if (url.includes("/exchange-rate") || url.includes("/dolar")) return respond({ buy: 1050, sell: 1080 });
    if (url.includes("/notifications")) return respond([]);
    if (url.includes("/vouchers")) return respond({ items: [], total: 0 });
    if (url.includes("/current-account")) return respond({ items: [], total: 0, balance: 0 });

    // Catch-all: return empty success
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

// ─── Auth Bypass ──────────────────────────────────────────────────────────────

async function injectAuth(page: Page) {
  await page.addInitScript((state) => {
    localStorage.setItem("auth-storage:tenant", JSON.stringify(state));
  }, MOCK_AUTH_STATE);
}

// ─── Screenshot Capture ───────────────────────────────────────────────────────

interface ScreenTarget {
  route: string;
  filename: string;
  waitFor?: string;
  waitMs?: number;
}

const TARGETS: ScreenTarget[] = [
  { route: "/#/dashboard",  filename: "dashboard.png",  waitFor: "[data-testid='dashboard-stats'], .recharts-wrapper, h1", waitMs: 1500 },
  { route: "/#/sales",      filename: "ventas.png",     waitFor: "table, [data-testid='sales-list'], h1", waitMs: 1200 },
  { route: "/#/products",   filename: "productos.png",  waitFor: "table, [data-testid='product-list'], h1", waitMs: 1200 },
  { route: "/#/inventory",  filename: "inventario.png", waitFor: "table, h1", waitMs: 1200 },
  { route: "/#/clients",    filename: "clientes.png",   waitFor: "table, h1", waitMs: 1200 },
  { route: "/#/cash",       filename: "caja.png",       waitFor: "h1, [data-testid='cash-session']", waitMs: 1200 },
];

async function captureScreen(page: Page, target: ScreenTarget) {
  const url = `${BASE_URL}${target.route}`;
  console.log(`  → Navigating to ${target.route}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });

  if (target.waitFor) {
    await page.waitForSelector(target.waitFor, { timeout: 8000 }).catch(() => {});
  }

  if (target.waitMs) {
    await page.waitForTimeout(target.waitMs);
  }

  const outPath = path.join(OUT_DIR, target.filename);
  await page.screenshot({ path: outPath, type: "png", fullPage: false });
  console.log(`  ✓ Saved ${target.filename}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("OctopusTrack — Screenshot Capture");
  console.log("==================================");
  console.log(`Output dir: ${OUT_DIR}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    deviceScaleFactor: 1.5,
  });

  const page = await context.newPage();

  // Set up mocks and auth bypass before any navigation
  await setupApiMocks(page);
  await injectAuth(page);

  // First navigation to establish localStorage
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 10000 });
  await page.waitForTimeout(500);

  for (const target of TARGETS) {
    await captureScreen(page, target);
  }

  await browser.close();

  console.log("\n✓ All screenshots captured successfully.");
  console.log("  Run `npm start` inside video/ to preview the composition.");
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
