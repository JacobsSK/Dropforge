// ============================================================================
// DropForge — Express proxy server (Railway)
// ----------------------------------------------------------------------------
// Purpose:
//   1. Serve the single-file frontend from /public
//   2. Proxy Anthropic API calls so the API key NEVER ships to the browser
//   3. Expose /api/health so the frontend can detect "proxy mode" vs
//      "direct mode" (Claude.ai artifact preview) without any code changes
//   4. Hold clearly-commented 501 stubs for the three real integrations
//      (AliExpress/CJ import, Shopify publish, Facebook Marketing API)
//
// Railway setup:
//   - Add env var ANTHROPIC_API_KEY in the Railway project settings
//   - Railway injects PORT automatically
//   - Connect this repo via GitHub Desktop push → Railway auto-deploys
//
// Persistence note:
//   The frontend uses in-memory state for the artifact preview. For real
//   cross-session persistence, attach a small database here (Railway
//   Postgres or even SQLite on a volume) and add:
//     GET/PUT /api/stores      → load/save the stores array as JSON
//   The frontend already keeps all state in one serializable object
//   (window.DF.state), so wiring persistence is a ~20-line change.
// ============================================================================

const express = require('express');
const path = require('path');
const security = require('./security');

const app = express();
// App password on every /api route (except /api/health) + serves /auth.js.
// Runs before the body is read, so strangers can't even upload data.
security.install(app);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'Public')));

// The AI call is fixed here on the server. Whatever model or reply length the
// browser sends is ignored.
const AI_MODEL = 'claude-sonnet-4-6';
const AI_MAX_TOKENS = 5200;

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// Health check — the frontend calls this on load. 200 => proxy mode.
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'dropforge',
    proxy: true,
    keyConfigured: Boolean(ANTHROPIC_API_KEY),
  });
});

// ---------------------------------------------------------------------------
// Anthropic proxy — key stays server-side.
// ---------------------------------------------------------------------------
app.post('/api/generate', security.aiLimit, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set on the server. Add it in Railway → Variables.',
    });
  }
  const body = security.lockedClaudeBody(req.body, { model: AI_MODEL, maxTokens: AI_MAX_TOKENS });
  if (!body) return res.status(400).json({ error: 'messages[] is required' });
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[dropforge] Anthropic proxy error:', err);
    res.status(502).json({ error: 'Upstream Anthropic request failed', detail: String(err) });
  }
});

// ===========================================================================
// INTEGRATION STUBS — each returns 501 with a description of what attaches
// here. The frontend already calls these endpoints and degrades gracefully,
// so activating any of them requires ZERO frontend changes.
// ===========================================================================

// ---------------------------------------------------------------------------
// STUB 1: /api/product-import — AliExpress / CJ Dropshipping data feed
// ---------------------------------------------------------------------------
// What attaches here later:
//   - CJ Dropshipping API (developers.cjdropshipping.com): authenticate with
//     CJ_API_KEY, call product/query with the pasted URL or keyword, return
//     { title, images, costUSD, shippingDaysToUS, variants[], reviews }
//   - AliExpress has no clean official API for this; options are the
//     Affiliate (Portals) API or a scraping service (e.g. ScraperAPI/ZenRows)
//     — budget for that as a paid dependency.
// The Discovery tab will automatically switch from "AI-estimated" to
// "verified feed" pricing when this returns 200.
// ---------------------------------------------------------------------------
app.post('/api/product-import', (req, res) => {
  res.status(501).json({
    stub: true,
    error: 'Not implemented yet',
    attach: 'CJ Dropshipping product/query API (CJ_API_KEY env var) or AliExpress via scraping service',
    expectedResponse: {
      title: 'string', costUSD: 'number', suggestedAOV: 'number',
      shippingDaysToUS: 'number', variants: ['string'], reviewSummary: 'string',
    },
  });
});

// ---------------------------------------------------------------------------
// STUB 2: /api/shopify-publish — Shopify Admin API (OAuth per store)
// ---------------------------------------------------------------------------
// What attaches here later:
//   - Shopify custom app per store OR a public app with OAuth. Store the
//     access token per store (this is why each store card has an id).
//   - POST /admin/api/2024-10/products.json with the listing DropForge
//     already generates (title, body_html, variants, images).
//   - SA note: Shopify Payments is unavailable in South Africa — configure
//     PayFast or Yoco as the gateway inside Shopify; nothing changes here.
// ---------------------------------------------------------------------------
app.post('/api/shopify-publish', (req, res) => {
  res.status(501).json({
    stub: true,
    error: 'Not implemented yet',
    attach: 'Shopify Admin API — one access token per store, POST products.json with the generated listing',
  });
});

// ---------------------------------------------------------------------------
// STUB 3: /api/facebook-ads — Meta Marketing API
// ---------------------------------------------------------------------------
// What attaches here later:
//   - Meta app + system user token with ads_management scope.
//   - Pull spend / impressions / clicks / ATC / purchases per campaign via
//     the Insights API so the Gauntlet tiers auto-fill instead of manual
//     entry. Map: campaign_id ↔ DropForge store.tierData.
//   - Could also push campaign creation (broad, one country per ad set,
//     24/7 schedule) straight from the generated creative angles.
// ---------------------------------------------------------------------------
app.post('/api/facebook-ads', (req, res) => {
  res.status(501).json({
    stub: true,
    error: 'Not implemented yet',
    attach: 'Meta Marketing API Insights — auto-fill Gauntlet metrics per store; optional campaign push',
  });
});

app.listen(PORT, () => {
  console.log(`DropForge running on :${PORT}`);
});
