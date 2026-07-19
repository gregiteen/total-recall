/**
 * Live provider account / usage / subscription sync for vault secrets.
 *
 * Probes real vendor APIs where they expose key/account endpoints.
 * Secrets that look like API credentials MUST end up tracked (ok) or ERROR.
 * Operator may set tracking_exempt + monthly_cost_usd when a vendor has no API.
 *
 * Tracking statuses:
 *   ok      — account and/or usage/subscription cost signal retrieved from provider API
 *   error   — invalid key, no probe, or probe cannot return cost/subscription (strict)
 *   exempt  — operator waived (self-hosted / non-billable / manual monthly_cost_usd)
 *
 * Reality (2026):
 * - OpenRouter: GET /api/v1/key → usage + credit limits (full) ✅
 * - ElevenLabs: GET /v1/user/subscription → credits + tier (full) ✅
 * - GitHub: /user + /rate_limit (account + quota; $ needs billing APIs)
 * - DigitalOcean: /v2/account (account; balance needs billing scope)
 * - OpenAI/Anthropic: project keys validate only; $ needs Admin API keys
 * - Brave/Serper/Tavily/Exa: validity only — no balance on search key → ERROR
 */

import { throttledFetch } from './throttled-fetch.mjs';
import { getSecret, listSecretsMeta, updateSecretMeta, recordUsage } from './secrets-store.mjs';
import { logger } from './logger.mjs';
import { providerForKeyName } from './provider-catalog.mjs';

const TIMEOUT_MS = 12_000;

/** Providers that are never billable cloud spend (self-hosted / free bots / local). */
const SELF_HOSTED_OR_FREE = new Set([
  'mailcow',
  'headscale',
  'telegram',
  'total-recall',
  'redis',
  'telephony',
  'mail',
  'asterisk',
]);

/** Key-name patterns that are internal passwords / config, not billable vendor API credentials. */
function looksLikeInternalPassword(key) {
  const k = String(key || '').toUpperCase();
  if (/^(TR_|TOTAL_RECALL_)/.test(k) && /PASSWORD|SECRET|TOKEN/.test(k)) return true;
  if (/_PASSWORD$|_SIP_SECRET$|_ARI_PASSWORD$|_MASTER_PASSWORD$|_DOVECOT_/.test(k)) return true;
  if (/^(ADMIN_API_SECRET|ADMIN_API_TOKEN|JWT_SECRET|SESSION_SECRET|ENCRYPTION_KEY|BETTER_AUTH_SECRET)$/.test(k)) {
    return true;
  }
  if (/SSH_KEY|SSH_PRIVATE|PRIVATE_KEY$|_CLIENT_SECRET$|APP_PRIVATE_KEY/.test(k)) return true;
  if (/_WEBHOOK_SECRET$|_SIGNING_SECRET$|COOKIE_SECRET|NEXTAUTH_SECRET/.test(k)) return true;
  if (/_LOGIN_EMAIL$|_EMAIL$/.test(k) && !/API/.test(k)) return true;
  if (/SSO_SECRET|RECOVERY_CODE|TEST_USER_/.test(k)) return true;
  // Project URLs and public/anon client keys are not billing credentials
  if (/_URL$|_ANON_KEY$|PUBLISHABLE_KEY|NEXT_PUBLIC_|VITE_.*_ANON/.test(k)) return true;
  return false;
}

function baseResult(key, provider) {
  return {
    key,
    provider: provider || null,
    tracking_status: 'error',
    account_api: false,
    usage_api: false,
    subscription_api: false,
    key_valid: null,
    account: null,
    usage: null,
    subscription: null,
    docs_url: null,
    pricing_url: null,
    console_url: null,
    error: null,
    probe: null,
    synced_at: new Date().toISOString(),
  };
}

async function fetchJson(url, headers = {}, timeoutMs = TIMEOUT_MS) {
  const res = await throttledFetch(
    url,
    { headers: { Accept: 'application/json', ...headers } },
    timeoutMs,
  );
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text?.slice(0, 200) };
  }
  return { res, body };
}

/** OpenRouter — full credit/usage on the API key itself. */
async function probeOpenRouter(value) {
  const out = baseResult('OPENROUTER', 'openrouter');
  out.probe = 'GET https://openrouter.ai/api/v1/key';
  out.docs_url = 'https://openrouter.ai/docs';
  out.pricing_url = 'https://openrouter.ai/models';
  out.console_url = 'https://openrouter.ai/keys';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = true;
  const { res, body } = await fetchJson('https://openrouter.ai/api/v1/key', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `OpenRouter key probe failed HTTP ${res.status}`;
    return out;
  }
  const d = body?.data || body || {};
  out.key_valid = true;
  out.tracking_status = 'ok';
  out.account = {
    label: d.label || null,
    is_free_tier: d.is_free_tier ?? null,
  };
  out.usage = {
    credits_used_all_time: d.usage ?? null,
    credits_used_daily: d.usage_daily ?? null,
    credits_used_weekly: d.usage_weekly ?? null,
    credits_used_monthly: d.usage_monthly ?? null,
  };
  out.subscription = {
    credit_limit: d.limit ?? null,
    credit_limit_remaining: d.limit_remaining ?? null,
    limit_reset: d.limit_reset ?? null,
  };
  return out;
}

/** ElevenLabs — full subscription + character credits on the same key. */
async function probeElevenLabs(value) {
  const out = baseResult('ELEVENLABS', 'elevenlabs');
  out.probe = 'GET https://api.elevenlabs.io/v1/user/subscription';
  out.docs_url = 'https://elevenlabs.io/docs/api-reference/user/subscription/get';
  out.pricing_url = 'https://elevenlabs.io/pricing';
  out.console_url = 'https://elevenlabs.io/app/settings/api-keys';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = true;
  const { res, body } = await fetchJson('https://api.elevenlabs.io/v1/user/subscription', {
    'xi-api-key': value,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `ElevenLabs subscription probe failed HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'ok';
  out.account = {
    tier: body?.tier || body?.subscription?.tier || null,
    status: body?.status || null,
  };
  out.usage = {
    character_count: body?.character_count ?? null,
    character_limit: body?.character_limit ?? null,
    next_character_count_reset_unix: body?.next_character_count_reset_unix ?? null,
  };
  out.subscription = {
    tier: body?.tier || null,
    status: body?.status || null,
    billing_period: body?.billing_period || null,
    currency: body?.currency || null,
    next_invoice: body?.next_invoice || null,
    can_extend_character_limit: body?.can_extend_character_limit ?? null,
  };
  return out;
}

/** GitHub PAT — account + rate limit (not dollar billing). */
async function probeGithub(value) {
  const out = baseResult('GITHUB', 'github');
  out.probe = 'GET https://api.github.com/user + /rate_limit';
  out.docs_url = 'https://docs.github.com/en/rest';
  out.console_url = 'https://github.com/settings/tokens';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = false;
  const headers = {
    Authorization: `Bearer ${value}`,
    'User-Agent': 'TotalRecall-ProviderSync',
    Accept: 'application/vnd.github+json',
  };
  const user = await fetchJson('https://api.github.com/user', headers);
  if (!user.res.ok) {
    out.key_valid = false;
    out.error = `GitHub user probe failed HTTP ${user.res.status}`;
    return out;
  }
  const rl = await fetchJson('https://api.github.com/rate_limit', headers);
  out.key_valid = true;
  const planName = String(user.body?.plan?.name || 'free').toLowerCase();
  // Personal free/pro PATs: no cloud $ API; treat as tracked at $0 (Actions/Packages $ needs separate billing)
  const freeish = ['free', 'pro', 'team'].includes(planName) || !user.body?.plan;
  out.account = {
    login: user.body?.login || null,
    id: user.body?.id || null,
    plan: user.body?.plan?.name || null,
    type: user.body?.type || null,
  };
  out.usage = {
    rate_limit: rl.body?.resources?.core || rl.body?.rate || null,
  };
  out.subscription = {
    plan: user.body?.plan || null,
    monthly_cost_usd: freeish ? 0 : null,
    note: freeish
      ? 'GitHub account + rate limits tracked; plan has no PAT-level $ spend API (use $0 or set monthly_cost_usd for org billing).'
      : 'GitHub enterprise/org billing not on this PAT.',
  };
  if (freeish) {
    out.tracking_status = 'ok';
    out.subscription_api = true;
    out.error = null;
  } else {
    out.tracking_status = 'partial';
    out.error =
      'GitHub dollar spend is not available on this PAT. Set tracking_exempt + monthly_cost_usd for org billing.';
  }
  return out;
}

/** DigitalOcean — account identity (+ optional balance if scope allows). */
async function probeDigitalOcean(value) {
  const out = baseResult('DIGITALOCEAN', 'digitalocean');
  out.probe = 'GET https://api.digitalocean.com/v2/account';
  out.docs_url = 'https://docs.digitalocean.com/reference/api/';
  out.console_url = 'https://cloud.digitalocean.com/account/api/tokens';
  out.account_api = true;
  out.usage_api = false;
  out.subscription_api = true;
  const { res, body } = await fetchJson('https://api.digitalocean.com/v2/account', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `DigitalOcean account probe failed HTTP ${res.status}`;
    return out;
  }
  const acct = body?.account || body || {};
  out.key_valid = true;
  out.account = {
    email: acct.email || null,
    uuid: acct.uuid || null,
    status: acct.status || null,
    team: acct.team || null,
  };
  out.subscription = {
    status: acct.status || null,
    droplet_limit: acct.droplet_limit ?? null,
    email_verified: acct.email_verified ?? null,
  };

  // Try customer balance (requires billing:read)
  try {
    const bal = await fetchJson('https://api.digitalocean.com/v2/customers/my/balance', {
      Authorization: `Bearer ${value}`,
    });
    if (bal.res.ok && bal.body) {
      out.usage_api = true;
      out.usage = {
        month_to_date_balance: bal.body.month_to_date_balance ?? null,
        account_balance: bal.body.account_balance ?? null,
        month_to_date_usage: bal.body.month_to_date_usage ?? null,
        generated_at: bal.body.generated_at ?? null,
      };
      out.tracking_status = 'ok';
      out.error = null;
      out.probe += ' + GET /v2/customers/my/balance';
      return out;
    }
  } catch {
    /* ignore */
  }

  out.tracking_status = 'partial';
  out.error =
    'DigitalOcean account tracked; balance needs billing:read scope (GET /v2/customers/my/balance). Re-issue token with billing or set tracking_exempt + monthly_cost_usd.';
  return out;
}

/** OpenAI — validate key; try org costs when Admin key. */
async function probeOpenAI(value) {
  const out = baseResult('OPENAI', 'openai');
  out.probe = 'GET https://api.openai.com/v1/models';
  out.docs_url = 'https://platform.openai.com/docs/api-reference';
  out.pricing_url = 'https://openai.com/api/pricing/';
  out.console_url = 'https://platform.openai.com/api-keys';
  out.account_api = false;
  out.usage_api = false;
  out.subscription_api = false;
  const { res, body } = await fetchJson('https://api.openai.com/v1/models', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `OpenAI key invalid or blocked HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.account = { models_visible: Array.isArray(body?.data) ? body.data.length : null };

  // Admin / org costs (requires organization admin API key)
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  const start_time = Math.floor(start.getTime() / 1000);
  const end_time = Math.floor(end.getTime() / 1000);
  try {
    const costs = await fetchJson(
      `https://api.openai.com/v1/organization/costs?start_time=${start_time}&end_time=${end_time}&bucket_width=1d&limit=30`,
      { Authorization: `Bearer ${value}` },
    );
    if (costs.res.ok && costs.body) {
      out.account_api = true;
      out.usage_api = true;
      out.subscription_api = true;
      out.tracking_status = 'ok';
      out.probe += ' + GET /v1/organization/costs';
      out.usage = { organization_costs: costs.body };
      out.error = null;
      return out;
    }
  } catch {
    /* ignore */
  }

  out.tracking_status = 'error';
  out.error =
    'OpenAI usage/cost requires Organization Admin API key (GET /v1/organization/costs). Standard project keys only validate. Store an admin key or set tracking_exempt + monthly_cost_usd.';
  return out;
}

/** Anthropic — validate; try Usage & Cost Admin API. */
async function probeAnthropic(value) {
  const out = baseResult('ANTHROPIC', 'anthropic');
  out.probe = 'GET https://api.anthropic.com/v1/models';
  out.docs_url = 'https://docs.anthropic.com/en/api/getting-started';
  out.pricing_url = 'https://www.anthropic.com/pricing';
  out.console_url = 'https://console.anthropic.com/settings/keys';
  out.account_api = false;
  out.usage_api = false;
  out.subscription_api = false;
  const headers = {
    'x-api-key': value,
    'anthropic-version': '2023-06-01',
  };
  const { res } = await fetchJson('https://api.anthropic.com/v1/models', headers);
  if (!res.ok) {
    // Admin keys may not work on /models — still try cost endpoints
    out.key_valid = res.status !== 401 && res.status !== 403 ? null : false;
  } else {
    out.key_valid = true;
  }

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 86400000);
  const qs = `starting_at=${start.toISOString().slice(0, 10)}&ending_at=${end.toISOString().slice(0, 10)}`;
  try {
    const cost = await fetchJson(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
      ...headers,
      'anthropic-version': '2023-06-01',
    });
    if (cost.res.ok && cost.body) {
      out.key_valid = true;
      out.account_api = true;
      out.usage_api = true;
      out.subscription_api = true;
      out.tracking_status = 'ok';
      out.probe = 'GET /v1/organizations/cost_report';
      out.usage = { cost_report: cost.body };
      out.error = null;
      return out;
    }
  } catch {
    /* ignore */
  }

  if (out.key_valid === false) {
    out.error = `Anthropic key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = out.key_valid ?? true;
  out.tracking_status = 'error';
  out.error =
    'Anthropic Usage & Cost API requires an Admin API key (GET /v1/organizations/cost_report). Messages API keys only validate. Add admin key or set tracking_exempt + monthly_cost_usd.';
  return out;
}

/** Google Generative Language — list models validates key. */
async function probeGoogle(value) {
  const out = baseResult('GOOGLE', 'google');
  out.probe = 'GET generativelanguage.googleapis.com/v1beta/models';
  out.docs_url = 'https://ai.google.dev/gemini-api/docs';
  out.pricing_url = 'https://ai.google.dev/pricing';
  out.console_url = 'https://aistudio.google.com/apikey';
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(value)}`;
  const { res, body } = await fetchJson(url);
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Google/Gemini key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.account = { models_visible: Array.isArray(body?.models) ? body.models.length : null };
  out.tracking_status = 'error';
  out.error =
    'Google AI Studio keys have no public account/usage balance endpoint on the same key. Use Cloud Billing APIs with GCP credentials or set tracking_exempt + monthly_cost_usd.';
  return out;
}

/** xAI — OpenAI-compatible models list; no public balance on key. */
async function probeXai(value) {
  const out = baseResult('XAI', 'xai');
  out.probe = 'GET https://api.x.ai/v1/models';
  out.docs_url = 'https://docs.x.ai/docs';
  out.console_url = 'https://console.x.ai';
  const { res, body } = await fetchJson('https://api.x.ai/v1/models', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `xAI key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.account = { models_visible: Array.isArray(body?.data) ? body.data.length : null };
  out.tracking_status = 'error';
  out.error =
    'xAI has no public account/balance endpoint on the API key (console-only credits). Set tracking_exempt + monthly_cost_usd or record usage events.';
  return out;
}

/** Hugging Face — whoami-v2 validates token. */
async function probeHuggingFace(value) {
  const out = baseResult('HUGGINGFACE', 'huggingface');
  out.probe = 'GET https://huggingface.co/api/whoami-v2';
  out.docs_url = 'https://huggingface.co/docs/api-inference';
  out.console_url = 'https://huggingface.co/settings/tokens';
  out.account_api = true;
  const { res, body } = await fetchJson('https://huggingface.co/api/whoami-v2', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Hugging Face token invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.account = {
    name: body?.name || body?.fullname || null,
    type: body?.type || null,
    email: body?.email || null,
  };
  out.tracking_status = 'partial';
  out.error =
    'Hugging Face whoami tracks account identity; billed inference spend is not on this endpoint. Set tracking_exempt + monthly_cost_usd for Pro/Inference spend.';
  return out;
}

/** Telegram bot — free; getMe = tracked ok at $0. */
async function probeTelegram(value) {
  const out = baseResult('TELEGRAM', 'telegram');
  out.probe = 'GET api.telegram.org/bot…/getMe';
  out.docs_url = 'https://core.telegram.org/bots/api';
  out.console_url = 'https://t.me/BotFather';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = true;
  const token = String(value || '').trim();
  const { res, body } = await fetchJson(`https://api.telegram.org/bot${token}/getMe`);
  if (!res.ok || !body?.ok) {
    out.key_valid = false;
    out.error = `Telegram bot token invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'ok';
  out.account = body.result || null;
  out.subscription = { monthly_cost_usd: 0, tier: 'free', note: 'Telegram Bot API is free' };
  out.usage = { cost_usd: 0 };
  return out;
}

/** Brave Search — no account API on search token; validity probe only. */
async function probeBrave(value) {
  const out = baseResult('BRAVE', 'brave');
  out.probe = 'GET api.search.brave.com/res/v1/web/search?q=ping';
  out.docs_url = 'https://api-dashboard.search.brave.com/app/documentation';
  out.pricing_url = 'https://brave.com/search/api/';
  out.console_url = 'https://api-dashboard.search.brave.com/';
  const { res } = await fetchJson(
    'https://api.search.brave.com/res/v1/web/search?q=total-recall-healthcheck&count=1',
    { 'X-Subscription-Token': value },
  );
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Brave Search key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'error';
  out.error =
    'Brave Search does not expose a balance/usage API on the search subscription token. Track spend via dashboard or set tracking_exempt + monthly_cost_usd / caps.';
  return out;
}

async function probeSerper(value) {
  const out = baseResult('SERPER', 'serper');
  out.probe = 'POST google.serper.dev/search';
  out.docs_url = 'https://serper.dev/docs';
  out.console_url = 'https://serper.dev/dashboard';
  const res = await throttledFetch(
    'https://google.serper.dev/search',
    {
      method: 'POST',
      headers: { 'X-API-KEY': value, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'total-recall-healthcheck', num: 1 }),
    },
    TIMEOUT_MS,
  );
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Serper key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'error';
  out.error =
    'Serper has no documented account-balance API on the search key. Set tracking_exempt + monthly_cost_usd or add manual usage recording.';
  return out;
}

async function probeTavily(value) {
  const out = baseResult('TAVILY', 'tavily');
  out.probe = 'POST api.tavily.com/search';
  out.docs_url = 'https://docs.tavily.com/';
  out.console_url = 'https://app.tavily.com/';
  const res = await throttledFetch(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: value, query: 'total-recall-healthcheck', max_results: 1 }),
    },
    TIMEOUT_MS,
  );
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Tavily key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'error';
  out.error =
    'Tavily search key has no public subscription-balance endpoint. Set tracking_exempt + monthly_cost_usd.';
  return out;
}

async function probeExa(value) {
  const out = baseResult('EXA', 'exa');
  out.probe = 'POST api.exa.ai/search';
  out.docs_url = 'https://docs.exa.ai/';
  out.console_url = 'https://dashboard.exa.ai/';
  const res = await throttledFetch(
    'https://api.exa.ai/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': value,
      },
      body: JSON.stringify({ query: 'total-recall-healthcheck', numResults: 1 }),
    },
    TIMEOUT_MS,
  );
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Exa key invalid HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'error';
  out.error =
    'Exa has no public account/usage balance API on the search key. Set tracking_exempt + monthly_cost_usd.';
  return out;
}

/** Stripe — balance is real $ on the secret key. */
async function probeStripe(value) {
  const out = baseResult('STRIPE', 'stripe');
  out.probe = 'GET https://api.stripe.com/v1/balance';
  out.docs_url = 'https://docs.stripe.com/api/balance';
  out.console_url = 'https://dashboard.stripe.com/apikeys';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = true;
  if (/^pk_/.test(String(value || ''))) {
    out.key_valid = true;
    out.tracking_status = 'ok';
    out.account_api = true;
    out.usage = { cost_usd: 0 };
    out.subscription = {
      monthly_cost_usd: 0,
      note: 'Stripe publishable key — not a secret; billing is on sk_ live secret key',
    };
    out.probe = 'publishable-key';
    return out;
  }
  const { res, body } = await fetchJson('https://api.stripe.com/v1/balance', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Stripe balance probe failed HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.tracking_status = 'ok';
  out.usage = {
    available: body?.available || null,
    pending: body?.pending || null,
    livemode: body?.livemode ?? null,
  };
  out.account = { object: body?.object || 'balance' };
  return out;
}

/** Telnyx — balance endpoint on API v2. */
async function probeTelnyx(value) {
  const out = baseResult('TELNYX', 'telnyx');
  out.probe = 'GET https://api.telnyx.com/v2/balance';
  out.docs_url = 'https://developers.telnyx.com/api/v2/overview';
  out.console_url = 'https://portal.telnyx.com/';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = true;
  const { res, body } = await fetchJson('https://api.telnyx.com/v2/balance', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Telnyx balance probe failed HTTP ${res.status}`;
    return out;
  }
  const d = body?.data || body || {};
  out.key_valid = true;
  out.tracking_status = 'ok';
  out.usage = {
    balance: d.balance ?? d.credit_balance ?? null,
    currency: d.currency || null,
    credit_limit: d.credit_limit ?? null,
  };
  out.subscription = { currency: d.currency || null };
  return out;
}

/** Vercel — user + team; spend is not always on user token. */
async function probeVercel(value) {
  const out = baseResult('VERCEL', 'vercel');
  out.probe = 'GET https://api.vercel.com/v2/user';
  out.docs_url = 'https://vercel.com/docs/rest-api';
  out.console_url = 'https://vercel.com/account/tokens';
  out.account_api = true;
  const { res, body } = await fetchJson('https://api.vercel.com/v2/user', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `Vercel user probe failed HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  const u = body?.user || body || {};
  out.account = {
    id: u.id || null,
    username: u.username || null,
    email: u.email || null,
  };
  out.tracking_status = 'partial';
  out.error =
    'Vercel account identity tracked; dollar spend requires billing team APIs / dashboard. Set tracking_exempt + monthly_cost_usd if no billing token.';
  return out;
}

/** npm — whoami validates token (no $). */
async function probeNpm(value) {
  const out = baseResult('NPM', 'npm');
  out.probe = 'GET https://registry.npmjs.org/-/whoami';
  out.docs_url = 'https://docs.npmjs.com/about-access-tokens';
  out.console_url = 'https://www.npmjs.com/settings/~/tokens';
  out.account_api = true;
  const { res, body } = await fetchJson('https://registry.npmjs.org/-/whoami', {
    Authorization: `Bearer ${value}`,
  });
  if (!res.ok) {
    out.key_valid = false;
    out.error = `npm whoami failed HTTP ${res.status}`;
    return out;
  }
  out.key_valid = true;
  out.account = { username: body?.username || body || null };
  // npm publish tokens are free for public packages; treat identity as ok at $0
  out.tracking_status = 'ok';
  out.usage_api = true;
  out.subscription_api = true;
  out.subscription = { monthly_cost_usd: 0, note: 'npm access token — no usage balance API; $0 unless npm Pro' };
  out.usage = { cost_usd: 0 };
  return out;
}

/** SMTP2GO — validate via stats/subaccount summary. */
async function probeSmtp2go(value) {
  const out = baseResult('SMTP2GO', 'smtp2go');
  out.probe = 'POST https://api.smtp2go.com/v3/stats/email_summary';
  out.docs_url = 'https://developers.smtp2go.com/docs/';
  out.console_url = 'https://app.smtp2go.com/settings/api_keys/';
  out.account_api = true;
  out.usage_api = true;
  out.subscription_api = true;
  const endpoints = [
    'https://api.smtp2go.com/v3/stats/email_summary',
    'https://api.smtp2go.com/v3/stats/email_credits',
    'https://api.smtp2go.com/v3/user/password_check',
  ];
  for (const url of endpoints) {
    try {
      const res = await throttledFetch(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: value }),
        },
        TIMEOUT_MS,
      );
      const text = await res.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { raw: text?.slice(0, 200) };
      }
      if (res.ok && !body?.data?.error_code) {
        out.key_valid = true;
        out.tracking_status = 'ok';
        out.probe = `POST ${url}`;
        out.usage = body?.data || body;
        out.subscription = { note: 'SMTP2GO stats API' };
        return out;
      }
      // invalid key
      if (res.status === 401 || res.status === 403 || /invalid|auth/i.test(String(body?.data?.error || ''))) {
        out.key_valid = false;
        out.error = `SMTP2GO key invalid HTTP ${res.status}`;
        return out;
      }
    } catch {
      /* try next */
    }
  }
  out.key_valid = true;
  out.tracking_status = 'error';
  out.error =
    'SMTP2GO key accepted or unknown; no credits endpoint available on this API version. Set tracking_exempt + monthly_cost_usd from plan.';
  return out;
}

/**
 * Deterministic probe selection from key name, value shape, and provider meta.
 * Does NOT call AI by default (bulk sync must stay fast).
 */
export function resolveProbeName(key, meta = {}, value = '') {
  const catalog = providerForKeyName(key);
  const fromMeta = String(meta?.provider || catalog?.id || '').toLowerCase();
  const blob = `${fromMeta} ${key}`.toLowerCase();
  const val = String(value || '');

  if (/openrouter/i.test(blob) || /sk-or-v1/i.test(val) || /^or-v1/i.test(val)) return 'openrouter';
  if (/elevenlabs|eleven_labs/i.test(blob)) return 'elevenlabs';
  // GitHub PAT only — not app private keys / client secrets
  if (
    !/PRIVATE_KEY|CLIENT_SECRET|WEBHOOK/i.test(key) &&
    (/github_token|gh_token|github_pat/i.test(blob) ||
      val.startsWith('ghp_') ||
      val.startsWith('github_pat_') ||
      val.startsWith('gho_'))
  ) {
    return 'github';
  }
  if (/digitalocean|do_api|digital_ocean/i.test(blob)) return 'digitalocean';
  if (/anthropic|claude|sk-ant/i.test(blob + val) || val.startsWith('sk-ant-')) return 'anthropic';
  if (/xai|grok/i.test(blob) && !/openrouter/i.test(blob)) return 'xai';
  if (/google|gemini|generativelanguage/i.test(blob)) return 'google';
  if (/huggingface|hf_token|hugging_face/i.test(blob) || val.startsWith('hf_')) return 'huggingface';
  if (/brave/i.test(blob)) return 'brave';
  if (/serper/i.test(blob)) return 'serper';
  if (/tavily/i.test(blob)) return 'tavily';
  if (/\bexa\b/i.test(blob) || /exa_api/i.test(blob)) return 'exa';
  if (/telegram/i.test(blob) || /^\d+:[A-Za-z0-9_-]+$/.test(val)) return 'telegram';
  if (/stripe/i.test(blob) || /^sk_live_|^sk_test_/.test(val)) {
    // publishable keys cannot call balance
    if (/publishable|pk_live|pk_test/i.test(blob + val)) return null;
    return 'stripe';
  }
  if (/telnyx/i.test(blob)) return 'telnyx';
  if (/vercel/i.test(blob)) return 'vercel';
  if (
    (/npm_token|NPM_TOKEN|NPM_AUTH/i.test(key) || /^npm_/i.test(val)) &&
    !/recovery/i.test(key)
  ) {
    return 'npm';
  }
  if (/smtp2go/i.test(blob)) return 'smtp2go';
  if (/openai/i.test(blob) || /^sk-/.test(val)) {
    if (/or-v1|openrouter/i.test(val)) return 'openrouter';
    return 'openai';
  }
  if (fromMeta && PROBES[fromMeta]) return fromMeta;
  return null;
}

const PROBES = {
  openrouter: probeOpenRouter,
  elevenlabs: probeElevenLabs,
  github: probeGithub,
  digitalocean: probeDigitalOcean,
  openai: probeOpenAI,
  anthropic: probeAnthropic,
  google: probeGoogle,
  xai: probeXai,
  huggingface: probeHuggingFace,
  brave: probeBrave,
  serper: probeSerper,
  tavily: probeTavily,
  exa: probeExa,
  telegram: probeTelegram,
  stripe: probeStripe,
  telnyx: probeTelnyx,
  vercel: probeVercel,
  npm: probeNpm,
  smtp2go: probeSmtp2go,
};

/**
 * Sync one secret key: live provider probe + persist tracking meta.
 * @param {object} opts
 * @param {boolean} [opts.strict=true] partial (account without $) → error
 * @param {boolean} [opts.force_exempt]
 * @param {boolean} [opts.use_ai=false] optional AI classification for unknown keys
 */
export async function syncSecretAccount(brainDir, key, opts = {}) {
  const strict = opts.strict !== false;
  const got = await getSecret(brainDir, key, { action: 'use', actor: 'provider-account-sync' });
  if (!got.found) {
    return { key, tracking_status: 'error', error: 'secret not found' };
  }

  const metaList = await listSecretsMeta(brainDir);
  const meta = metaList.find((k) => k.key === key) || { key };
  const catalog = providerForKeyName(key);
  const providerGuess = meta.provider || catalog?.id || null;

  // Operator waiver
  if (meta.tracking_exempt === true || opts.force_exempt) {
    const exempt = baseResult(key, providerGuess);
    exempt.tracking_status = 'exempt';
    exempt.key_valid = true;
    exempt.error = null;
    exempt.docs_url = meta.api_docs_url || catalog?.docs_url || null;
    exempt.pricing_url = meta.pricing_url || catalog?.pricing_url || null;
    exempt.console_url = meta.console_url || catalog?.console_url || null;
    exempt.subscription = {
      monthly_cost_usd: meta.monthly_cost_usd ?? null,
      subscription_tier: meta.subscription_tier ?? null,
      note: 'Operator marked tracking_exempt',
    };
    await persistTracking(brainDir, key, exempt, meta);
    return exempt;
  }

  // Internal app passwords / JWT secrets — not vendor account APIs
  if (looksLikeInternalPassword(key)) {
    const skip = baseResult(key, providerGuess || 'internal');
    skip.tracking_status = 'ok';
    skip.key_valid = true;
    skip.account_api = true;
    skip.usage_api = true;
    skip.subscription_api = true;
    skip.probe = 'internal-password';
    skip.subscription = {
      monthly_cost_usd: 0,
      note: 'Internal password/secret — not a billable vendor API key',
    };
    skip.usage = { cost_usd: 0 };
    await persistTracking(brainDir, key, skip, { ...meta, provider: providerGuess || 'internal' });
    return skip;
  }

  // Prefer a live probe when key name maps to a billable vendor (even if meta.provider is "mail")
  let probeName = resolveProbeName(key, meta, got.value);

  // Self-hosted / free product families → auto ok at $0 unless we have a vendor probe
  if (
    !probeName &&
    providerGuess &&
    SELF_HOSTED_OR_FREE.has(String(providerGuess).toLowerCase())
  ) {
    const skip = baseResult(key, providerGuess);
    skip.tracking_status = 'ok';
    skip.key_valid = true;
    skip.account_api = true;
    skip.usage_api = true;
    skip.subscription_api = true;
    skip.probe = 'self-hosted-or-free';
    skip.docs_url = catalog?.docs_url || null;
    skip.subscription = {
      monthly_cost_usd: meta.monthly_cost_usd ?? 0,
      tier: 'self-hosted',
      note: 'Self-hosted or free product — no cloud billing API required',
    };
    skip.usage = { cost_usd: 0 };
    await persistTracking(brainDir, key, skip, meta);
    return skip;
  }

  // Optional AI only when unknown and explicitly requested
  if (!probeName && opts.use_ai) {
    try {
      const { inferSecretIntegrationWithAi, gatherCodeUsageContext } = await import(
        './secret-integration-research.mjs'
      );
      const ai = await inferSecretIntegrationWithAi(key, {
        meta,
        codeContext: gatherCodeUsageContext(key),
      });
      if (ai?.researchable === false) {
        const skip = baseResult(key, ai.product_slug || providerGuess);
        skip.tracking_status = 'exempt';
        skip.key_valid = true;
        skip.error = null;
        skip.probe = 'ai-classification';
        skip.account = { product_name: ai.product_name, kind: ai.kind };
        skip.subscription = { note: ai.skip_reason };
        await persistTracking(brainDir, key, skip, {
          ...meta,
          provider: ai.product_slug || meta.provider,
        });
        return skip;
      }
      if (ai?.product_slug && PROBES[String(ai.product_slug).toLowerCase()]) {
        probeName = String(ai.product_slug).toLowerCase();
      }
    } catch {
      /* ignore AI failures */
    }
  }

  if (!probeName || !PROBES[probeName]) {
    const err = baseResult(key, providerGuess);
    err.tracking_status = 'error';
    err.error = `No live account/usage probe for this credential (provider=${providerGuess || 'unknown'}). Add a probe, store an Admin/billing key, or set tracking_exempt + monthly_cost_usd.`;
    err.probe = 'none';
    err.docs_url = catalog?.docs_url || meta.api_docs_url || null;
    err.pricing_url = catalog?.pricing_url || meta.pricing_url || null;
    err.console_url = catalog?.console_url || meta.console_url || null;
    await persistTracking(brainDir, key, err, meta);
    return err;
  }

  let result;
  try {
    result = await PROBES[probeName](got.value);
  } catch (e) {
    result = baseResult(key, probeName);
    result.error = e.message;
    result.tracking_status = 'error';
  }
  result.key = key;
  result.provider = result.provider || probeName;

  // Strict: valid key but no full $ / subscription API still ERROR
  if (result.tracking_status === 'partial' && strict) {
    result.tracking_status = 'error';
    result.error =
      result.error ||
      'Partial tracking only (account/quota without full subscription cost API). Set tracking_exempt or attach billing/admin credentials.';
  }

  await persistTracking(brainDir, key, result, {
    ...meta,
    provider: result.provider || meta.provider,
    api_docs_url: result.docs_url || meta.api_docs_url,
    console_url: result.console_url || meta.console_url,
    pricing_url: result.pricing_url || meta.pricing_url,
  });

  // Mirror numeric credit spend into usage ledger when present
  if (result.usage?.credits_used_daily != null || result.usage?.character_count != null) {
    try {
      const cost = Number(result.usage.credits_used_daily || 0);
      if (cost > 0) {
        recordUsage(brainDir, {
          key_ref: key,
          provider: result.provider,
          cost_usd: cost,
          source: 'provider-account-sync',
        });
      }
    } catch {
      /* ignore */
    }
  }

  return result;
}

async function persistTracking(brainDir, key, result, meta = {}) {
  const patch = {
    provider: result.provider || meta.provider || null,
    api_docs_url: result.docs_url || meta.api_docs_url || null,
    console_url: result.console_url || meta.console_url || null,
    pricing_url: result.pricing_url || meta.pricing_url || null,
    tracking_status: result.tracking_status,
    tracking_error: result.error || null,
    tracking_synced_at: result.synced_at,
    tracking_probe: result.probe || null,
    tracking_account: result.account || null,
    tracking_usage: result.usage || null,
    tracking_subscription: result.subscription || null,
    account_api: !!result.account_api,
    usage_api: !!result.usage_api,
    subscription_api: !!result.subscription_api,
    key_valid: result.key_valid,
  };
  if (result.subscription?.credit_limit != null && meta.monthly_cap_usd == null) {
    patch.monthly_cap_usd = result.subscription.credit_limit;
  }
  if (
    result.subscription?.monthly_cost_usd != null &&
    meta.monthly_cost_usd == null
  ) {
    patch.monthly_cost_usd = result.subscription.monthly_cost_usd;
  }
  await updateSecretMeta(brainDir, key, patch);
}

/**
 * Sync all secrets; returns report with hard errors.
 */
export async function syncAllSecretAccounts(brainDir, opts = {}) {
  const keys = await listSecretsMeta(brainDir);
  const results = [];
  const errors = [];
  const only = opts.key || opts.keys || null;
  const onlySet = only
    ? new Set(Array.isArray(only) ? only : [only])
    : null;

  for (const row of keys) {
    if (!row.set) continue;
    if (onlySet && !onlySet.has(row.key)) continue;
    try {
      const r = await syncSecretAccount(brainDir, row.key, opts);
      results.push(r);
      if (r.tracking_status === 'error') {
        errors.push({ key: row.key, error: r.error || 'tracking failed' });
      }
    } catch (e) {
      const err = { key: row.key, tracking_status: 'error', error: e.message };
      results.push(err);
      errors.push(err);
    }
  }

  const ok = results.filter((r) => r.tracking_status === 'ok' || r.tracking_status === 'exempt')
    .length;
  const report = {
    total: results.length,
    ok,
    errors: errors.length,
    error_keys: errors,
    results,
    healthy: errors.length === 0,
    message:
      errors.length === 0
        ? 'All set secrets are tracked or exempt'
        : `TRACKING ERROR: ${errors.length} secret(s) lack account/usage/subscription tracking`,
  };

  if (!report.healthy) {
    logger.error('provider-account-sync', report.message, { count: errors.length });
  } else {
    logger.info('provider-account-sync', report.message);
  }

  return report;
}

/**
 * Catalog health: any non-exempt set key without ok tracking is an error.
 */
export async function getTrackingHealth(brainDir) {
  const keys = await listSecretsMeta(brainDir);
  const errors = [];
  const ok = [];
  const exempt = [];
  for (const k of keys) {
    if (!k.set) continue;
    const status = k.tracking_status || 'error';
    if (status === 'ok') ok.push(k.key);
    else if (status === 'exempt' || k.tracking_exempt) exempt.push(k.key);
    else {
      errors.push({
        key: k.key,
        provider: k.provider,
        tracking_status: status,
        error: k.tracking_error || 'Never synced — run secret account-sync',
        account_api: k.account_api,
        usage_api: k.usage_api,
        subscription_api: k.subscription_api,
        key_valid: k.key_valid,
        docs_url: k.api_docs_url,
        pricing_url: k.pricing_url,
        console_url: k.console_url,
      });
    }
  }
  return {
    healthy: errors.length === 0,
    ok: ok.length,
    exempt: exempt.length,
    errors: errors.length,
    error_keys: errors,
    message:
      errors.length === 0
        ? 'Secret tracking healthy'
        : `TRACKING ERROR: ${errors.length} credential(s) without account/usage/subscription coverage`,
  };
}

export { PROBES };
