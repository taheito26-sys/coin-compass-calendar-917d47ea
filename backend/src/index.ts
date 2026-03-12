import { Hono } from "hono";
import type { Env } from "./types";
import { corsMiddleware } from "./middleware/cors";
import assetsRoute from "./routes/assets";
import pricesRoute from "./routes/prices";
import marketDataRoute from "./routes/market-data";
import transactionsRoute from "./routes/transactions";
import trackingRoute from "./routes/tracking";
import importedFilesRoute from "./routes/imported-files";
import preferencesRoute from "./routes/preferences";
import importRoute from "./routes/import";
import fearGreedRoute from "./routes/fear-greed";
import exchangeSyncRoute from "./routes/exchange-sync";
import merchantProfilesRoute from "./routes/merchant-profiles";
import merchantInvitesRoute from "./routes/merchant-invites";
import merchantRelationshipsRoute from "./routes/merchant-relationships";
import merchantDealsRoute from "./routes/merchant-deals";
import merchantMessagesRoute from "./routes/merchant-messages";
import merchantApprovalsRoute from "./routes/merchant-approvals";
import merchantAuditRoute from "./routes/merchant-audit";
import merchantNotificationsRoute from "./routes/merchant-notifications";
import merchantAdvancesRoute from "./routes/merchant-advances";
import merchantPurchasesRoute from "./routes/merchant-purchases";
import merchantProfitShareRoute from "./routes/merchant-profit-share";
import merchantPoolsRoute from "./routes/merchant-pools";
import merchantCommentsRoute from "./routes/merchant-comments";
import merchantAdjustmentsRoute from "./routes/merchant-adjustments";
import merchantTermsRoute from "./routes/merchant-terms";
import { pollPrices } from "./cron/poll-prices";

const app = new Hono<{ Bindings: Env }>();

// Global CORS
app.use("*", corsMiddleware);

// Routes
app.route("/api/assets", assetsRoute);
app.route("/api/prices", pricesRoute);
app.route("/api/market-data", marketDataRoute);
app.route("/api/transactions", transactionsRoute);
app.route("/api/tracking-preferences", trackingRoute);
app.route("/api/imported-files", importedFilesRoute);
app.route("/api/preferences", preferencesRoute);
app.route("/api/import", importRoute);
app.route("/api/fear-greed", fearGreedRoute);
app.route("/api/exchange-sync", exchangeSyncRoute);
app.route("/api/merchant", merchantProfilesRoute);
app.route("/api/merchant/invites", merchantInvitesRoute);
app.route("/api/merchant/relationships", merchantRelationshipsRoute);
app.route("/api/merchant/deals", merchantDealsRoute);
app.route("/api/merchant/messages", merchantMessagesRoute);
app.route("/api/merchant/approvals", merchantApprovalsRoute);
app.route("/api/merchant/audit", merchantAuditRoute);
app.route("/api/merchant/notifications", merchantNotificationsRoute);
app.route("/api/merchant/advances", merchantAdvancesRoute);
app.route("/api/merchant/purchases", merchantPurchasesRoute);
app.route("/api/merchant/profit-share", merchantProfitShareRoute);
app.route("/api/merchant/pools", merchantPoolsRoute);
app.route("/api/merchant/comments", merchantCommentsRoute);
app.route("/api/merchant/adjustments", merchantAdjustmentsRoute);
app.route("/api/merchant/terms", merchantTermsRoute);

// Health check
app.get("/api/status", async (c) => {
  const raw = await c.env.PRICE_KV.get("prices:latest");
  const latest = raw ? JSON.parse(raw) : null;
  return c.json({
    ok: !!latest,
    lastUpdate: latest?.ts || null,
    ageMs: latest ? Date.now() - latest.ts : null,
  });
});

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      pollPrices(env).catch((err) => console.error("[cryptotracker] price poll failed:", err.message)),
    );
  },
};
