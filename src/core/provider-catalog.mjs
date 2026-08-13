/**
 * Static provider catalog — docs, schema hints, default subscription fields.
 * Used by secrets UI/CLI; no secret values stored here.
 */

/** @typedef {{
 *   id: string,
 *   name: string,
 *   docs_url: string,
 *   pricing_url?: string,
 *   console_url?: string,
 *   key_patterns: string[],
 *   schema: { auth: string, header?: string, env_keys: string[], notes?: string },
 *   rotation?: {
 *     class?: 'provider_api' | 'provider_browser' | 'self_generated' | 'manual',
 *     high_risk?: boolean,
 *     manual_keys?: string[],
 *   },
 *   default_monthly_cap_usd?: number | null,
 *   tiers?: { id: string, label: string, monthly_usd?: number | null }[],
 * }} ProviderDef */

/** @type {ProviderDef[]} */
export const PROVIDER_CATALOG = [
  {
    id: 'openai',
    name: 'OpenAI',
    docs_url: 'https://platform.openai.com/docs/api-reference',
    pricing_url: 'https://openai.com/api/pricing/',
    console_url: 'https://platform.openai.com/api-keys',
    key_patterns: ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <key>',
      env_keys: ['OPENAI_API_KEY'],
      notes: 'Chat Completions + Responses APIs; org optional OPENAI_ORG_ID',
    },
    default_monthly_cap_usd: 50,
    tiers: [
      { id: 'free', label: 'Free / trial', monthly_usd: 0 },
      { id: 'payg', label: 'Pay as you go', monthly_usd: null },
      { id: 'team', label: 'Team', monthly_usd: null },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    docs_url: 'https://docs.anthropic.com/en/api/getting-started',
    pricing_url: 'https://www.anthropic.com/pricing',
    console_url: 'https://console.anthropic.com/settings/keys',
    key_patterns: ['ANTHROPIC_API_KEY'],
    schema: {
      auth: 'header',
      header: 'x-api-key: <key>',
      env_keys: ['ANTHROPIC_API_KEY'],
      notes: 'Messages API; anthropic-version header required',
    },
    default_monthly_cap_usd: 50,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'build', label: 'Build / payg', monthly_usd: null },
      { id: 'scale', label: 'Scale', monthly_usd: null },
    ],
  },
  {
    id: 'google',
    name: 'Google AI / Gemini',
    docs_url: 'https://ai.google.dev/gemini-api/docs',
    pricing_url: 'https://ai.google.dev/pricing',
    console_url: 'https://aistudio.google.com/apikey',
    key_patterns: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    schema: {
      auth: 'query_or_header',
      header: 'x-goog-api-key: <key>',
      env_keys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    },
    default_monthly_cap_usd: 25,
    tiers: [
      { id: 'free', label: 'Free tier', monthly_usd: 0 },
      { id: 'payg', label: 'Paid', monthly_usd: null },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    docs_url: 'https://openrouter.ai/docs',
    pricing_url: 'https://openrouter.ai/models',
    console_url: 'https://openrouter.ai/keys',
    key_patterns: ['OPENROUTER_API_KEY'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <key>',
      env_keys: ['OPENROUTER_API_KEY'],
      notes: 'OpenAI-compatible base URL https://openrouter.ai/api/v1',
    },
    default_monthly_cap_usd: 30,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    docs_url: 'https://docs.x.ai/docs',
    console_url: 'https://console.x.ai',
    key_patterns: ['XAI_API_KEY', 'GROK_API_KEY'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <key>',
      env_keys: ['XAI_API_KEY'],
    },
    default_monthly_cap_usd: 30,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'brave',
    name: 'Brave Search',
    docs_url: 'https://api-dashboard.search.brave.com/app/documentation',
    console_url: 'https://api-dashboard.search.brave.com/',
    key_patterns: ['BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY'],
    schema: {
      auth: 'header',
      header: 'X-Subscription-Token: <key>',
      env_keys: ['BRAVE_SEARCH_API_KEY'],
    },
    default_monthly_cap_usd: 5,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'base', label: 'Base', monthly_usd: 5 },
      { id: 'pro', label: 'Pro', monthly_usd: null },
    ],
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    docs_url: 'https://elevenlabs.io/docs/api-reference',
    pricing_url: 'https://elevenlabs.io/pricing',
    console_url: 'https://elevenlabs.io/app/settings/api-keys',
    key_patterns: ['ELEVENLABS_API_KEY', 'ELEVEN_LABS_API_KEY'],
    schema: {
      auth: 'header',
      header: 'xi-api-key: <key>',
      env_keys: ['ELEVENLABS_API_KEY'],
    },
    default_monthly_cap_usd: 22,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'starter', label: 'Starter', monthly_usd: 5 },
      { id: 'creator', label: 'Creator', monthly_usd: 22 },
      { id: 'pro', label: 'Pro', monthly_usd: 99 },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    docs_url: 'https://docs.github.com/en/rest',
    console_url: 'https://github.com/settings/tokens',
    key_patterns: ['GITHUB_TOKEN', 'GH_TOKEN'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <token>',
      env_keys: ['GITHUB_TOKEN', 'GH_TOKEN'],
    },
    default_monthly_cap_usd: null,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'pro', label: 'Pro', monthly_usd: 4 },
      { id: 'team', label: 'Team', monthly_usd: 4 },
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    docs_url: 'https://supabase.com/docs/reference/javascript/introduction',
    console_url: 'https://supabase.com/dashboard',
    key_patterns: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    schema: {
      auth: 'header',
      header: 'apikey + Authorization Bearer',
      env_keys: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    },
    default_monthly_cap_usd: 25,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'pro', label: 'Pro', monthly_usd: 25 },
      { id: 'team', label: 'Team', monthly_usd: 599 },
    ],
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    docs_url: 'https://docs.digitalocean.com/reference/api/',
    console_url: 'https://cloud.digitalocean.com/account/api/tokens',
    key_patterns: ['DIGITALOCEAN_API_TOKEN', 'DO_API_TOKEN', 'DIGITALOCEAN_ACCESS_TOKEN'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <token>',
      env_keys: ['DIGITALOCEAN_API_TOKEN'],
    },
    default_monthly_cap_usd: null,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    docs_url: 'https://huggingface.co/docs/api-inference',
    console_url: 'https://huggingface.co/settings/tokens',
    key_patterns: ['HUGGINGFACE_API_KEY', 'HF_TOKEN'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <token>',
      env_keys: ['HF_TOKEN'],
    },
    default_monthly_cap_usd: 9,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'pro', label: 'Pro', monthly_usd: 9 },
    ],
  },
  {
    id: 'serper',
    name: 'Serper',
    docs_url: 'https://serper.dev/docs',
    console_url: 'https://serper.dev',
    key_patterns: ['SERPER_API_KEY'],
    schema: {
      auth: 'header',
      header: 'X-API-KEY: <key>',
      env_keys: ['SERPER_API_KEY'],
    },
    default_monthly_cap_usd: 50,
    tiers: [{ id: 'payg', label: 'Credits', monthly_usd: null }],
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    docs_url: 'https://core.telegram.org/bots/api',
    console_url: 'https://t.me/BotFather',
    key_patterns: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
    schema: {
      auth: 'path',
      env_keys: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
      notes: 'Token from BotFather; chat_id for notifications',
    },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'free', label: 'Free', monthly_usd: 0 }],
  },
  {
    id: 'total-recall',
    name: 'Total Recall',
    docs_url: 'https://github.com/gregiteen/total-recall',
    key_patterns: ['TOTAL_RECALL_TOKEN', 'TR_TOKEN', 'TR_SECRETS_PASSWORD'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <pat>',
      env_keys: ['TOTAL_RECALL_TOKEN'],
      notes: 'Dashboard PATs via /api/keys; secrets.enc for provider keys',
    },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'self-hosted', label: 'Self-hosted', monthly_usd: 0 }],
  },
  {
    id: 'smtp2go',
    name: 'SMTP2GO',
    docs_url: 'https://www.smtp2go.com/docs/',
    console_url: 'https://app.smtp2go.com/settings/api_keys/',
    key_patterns: ['SMTP2GO_API_KEY', 'SMTP2GO_PASSWORD'],
    schema: {
      auth: 'header',
      header: 'X-Smtp2go-Api-Key: <key>',
      env_keys: ['SMTP2GO_API_KEY'],
    },
    default_monthly_cap_usd: 15,
    tiers: [
      { id: 'free', label: 'Free', monthly_usd: 0 },
      { id: 'starter', label: 'Starter', monthly_usd: 15 },
    ],
  },
  {
    id: 'mailcow',
    name: 'Mailcow',
    docs_url: 'https://mailcow.github.io/mailcow-dockerized-docs/api/',
    key_patterns: ['MAILCOW_API_KEY', 'MAILCOW_ADMIN_PASSWORD', 'MAILCOW_SMTP_PASSWORD', 'MAILCOW_DOVECOT_MASTER_PASSWORD'],
    schema: {
      auth: 'header',
      header: 'X-API-Key: <key>',
      env_keys: ['MAILCOW_API_KEY'],
    },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'self-hosted', label: 'Self-hosted', monthly_usd: 0 }],
  },
  {
    id: 'headscale',
    name: 'Headscale',
    docs_url: 'https://github.com/juanfont/headscale',
    key_patterns: ['HEADSCALE_API_KEY', 'HEADSCALE_KEY'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <key>',
      env_keys: ['HEADSCALE_API_KEY'],
    },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'self-hosted', label: 'Self-hosted', monthly_usd: 0 }],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    docs_url: 'https://docs.stripe.com/api',
    pricing_url: 'https://stripe.com/pricing',
    console_url: 'https://dashboard.stripe.com/apikeys',
    key_patterns: ['STRIPE_SECRET_KEY', 'STRIPE_API_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
    schema: {
      auth: 'bearer',
      header: 'Authorization: Bearer <key>',
      env_keys: ['STRIPE_SECRET_KEY'],
      notes: 'Live keys are payment-critical. Roll with a grace window; never revoke before export confirms.',
    },
    // Stripe exposes no API to mint or roll secret keys — dashboard only, by design.
    rotation: { class: 'provider_browser', high_risk: true },
    default_monthly_cap_usd: null,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    docs_url: 'https://vercel.com/docs/rest-api',
    console_url: 'https://vercel.com/account/settings/tokens',
    key_patterns: ['VERCEL_API_TOKEN', 'VERCEL_TOKEN'],
    schema: { auth: 'bearer', header: 'Authorization: Bearer <token>', env_keys: ['VERCEL_API_TOKEN'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 20,
    tiers: [{ id: 'hobby', label: 'Hobby', monthly_usd: 0 }, { id: 'pro', label: 'Pro', monthly_usd: 20 }],
  },
  {
    id: 'telnyx',
    name: 'Telnyx',
    docs_url: 'https://developers.telnyx.com/api',
    console_url: 'https://portal.telnyx.com/#/app/api-keys',
    key_patterns: ['TELNYX_API_KEY', 'TELNYX_SIP_PASSWORD'],
    schema: { auth: 'bearer', header: 'Authorization: Bearer <key>', env_keys: ['TELNYX_API_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: null,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'fal',
    name: 'fal.ai',
    docs_url: 'https://docs.fal.ai',
    console_url: 'https://fal.ai/dashboard/keys',
    key_patterns: ['FAL_KEY', 'FAL_AI_API_KEY'],
    schema: { auth: 'header', header: 'Authorization: Key <key>', env_keys: ['FAL_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 20,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'tavily',
    name: 'Tavily',
    docs_url: 'https://docs.tavily.com',
    console_url: 'https://app.tavily.com/home',
    key_patterns: ['TAVILY_API_KEY'],
    schema: { auth: 'bearer', header: 'Authorization: Bearer <key>', env_keys: ['TAVILY_API_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 10,
    tiers: [{ id: 'free', label: 'Free', monthly_usd: 0 }],
  },
  {
    id: 'exa',
    name: 'Exa',
    docs_url: 'https://docs.exa.ai',
    console_url: 'https://dashboard.exa.ai/api-keys',
    key_patterns: ['EXA_API_KEY'],
    schema: { auth: 'header', header: 'x-api-key: <key>', env_keys: ['EXA_API_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 10,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
  {
    id: 'npm',
    name: 'npm',
    docs_url: 'https://docs.npmjs.com/about-access-tokens',
    console_url: 'https://www.npmjs.com/settings/~/tokens',
    key_patterns: ['NPM_TOKEN', 'NPM_RECOVERY_CODE'],
    schema: { auth: 'bearer', header: 'Authorization: Bearer <token>', env_keys: ['NPM_TOKEN'] },
    // Recovery codes are single-issue artifacts, never machine-rotatable.
    rotation: { class: 'provider_browser', manual_keys: ['NPM_RECOVERY_CODE'] },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'free', label: 'Free', monthly_usd: 0 }],
  },
  {
    id: 'pexels',
    name: 'Pexels',
    docs_url: 'https://www.pexels.com/api/documentation/',
    console_url: 'https://www.pexels.com/api/new/',
    key_patterns: ['PEXELS_API_KEY'],
    schema: { auth: 'header', header: 'Authorization: <key>', env_keys: ['PEXELS_API_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'free', label: 'Free', monthly_usd: 0 }],
  },
  {
    id: 'artificial-analysis',
    name: 'Artificial Analysis',
    docs_url: 'https://artificialanalysis.ai/documentation',
    console_url: 'https://artificialanalysis.ai/account/api-keys',
    key_patterns: ['ARTIFICIAL_ANALYSIS_API_KEY'],
    schema: { auth: 'header', header: 'x-api-key: <key>', env_keys: ['ARTIFICIAL_ANALYSIS_API_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 0,
    tiers: [{ id: 'free', label: 'Free', monthly_usd: 0 }],
  },
  {
    id: 'browser-use',
    name: 'Browser Use',
    docs_url: 'https://docs.browser-use.com',
    console_url: 'https://cloud.browser-use.com/settings/api-keys',
    key_patterns: ['BROWSER_USE_API_KEY'],
    schema: { auth: 'bearer', header: 'Authorization: Bearer <key>', env_keys: ['BROWSER_USE_API_KEY'] },
    rotation: { class: 'provider_browser' },
    default_monthly_cap_usd: 10,
    tiers: [{ id: 'payg', label: 'Pay as you go', monthly_usd: null }],
  },
];

const byId = new Map(PROVIDER_CATALOG.map((p) => [p.id, p]));

/**
 * @param {string} providerId
 */
export function getProvider(providerId) {
  if (!providerId) return null;
  return byId.get(String(providerId).toLowerCase()) || null;
}

/**
 * @param {string} keyName
 */
/**
 * Minimum length for a derived stem before it may be used for a fuzzy match.
 * Guards against short stems swallowing unrelated keys — e.g. the pattern
 * `TR_TOKEN` reduces to the stem `TR`, which as a bare substring matches
 * S-TR-IPE_SECRET_KEY and mis-attributes Stripe credentials to Total Recall.
 */
const MIN_FUZZY_STEM = 4;

/** Does `k` contain `stem` on an underscore token boundary (not mid-word)? */
function matchesOnTokenBoundary(k, stem) {
  return (
    k === stem ||
    k.startsWith(stem + '_') ||
    k.endsWith('_' + stem) ||
    k.includes('_' + stem + '_')
  );
}

/**
 * Resolve the provider that owns a secret key name.
 *
 * Matching is tiered strongest→weakest so an exact pattern always wins over a
 * fuzzy stem. Fuzzy tiers require a token boundary and a minimum stem length;
 * bare substring matching is never used.
 *
 * @param {string} keyName
 * @returns {ProviderDef|null}
 */
export function providerForKeyName(keyName) {
  // Strip packaging prefixes so DEVELOPER_BRAVE_SEARCH_API_KEY → BRAVE_SEARCH_API_KEY
  let k = String(keyName || '').toUpperCase();
  k = k.replace(/^(DEVELOPER_|VITE_|NEXT_PUBLIC_|PUBLIC_|NUXT_PUBLIC_|PORTFOLIO_|ULTRACHAT_)+/g, '');

  // Tier 1 — exact pattern match.
  for (const p of PROVIDER_CATALOG) {
    if (p.key_patterns.some((pat) => pat.toUpperCase() === k)) return p;
  }

  // Tier 2 — key is a suffixed variant of a full pattern (FOO_OPENAI_API_KEY).
  for (const p of PROVIDER_CATALOG) {
    if (p.key_patterns.some((pat) => k.endsWith('_' + pat.toUpperCase()))) return p;
  }

  // Tier 3 — pattern stem on a token boundary (GITHUB_TOKEN → GITHUB_APP_CLIENT_SECRET).
  for (const p of PROVIDER_CATALOG) {
    if (
      p.key_patterns.some((pat) => {
        const stem = pat.toUpperCase().replace(/_API_KEY$|_TOKEN$|_KEY$|_SECRET$/, '');
        if (stem.length < MIN_FUZZY_STEM) return false;
        return matchesOnTokenBoundary(k, stem);
      })
    ) {
      return p;
    }
  }

  // Tier 4 — provider id on a token boundary.
  const compact = k.replace(/-/g, '_');
  for (const p of PROVIDER_CATALOG) {
    const id = p.id.toUpperCase().replace(/-/g, '_');
    if (id.length < MIN_FUZZY_STEM) continue;
    if (matchesOnTokenBoundary(compact, id)) return p;
  }

  return null;
}

export function listProviders() {
  return PROVIDER_CATALOG.map((p) => ({
    id: p.id,
    name: p.name,
    docs_url: p.docs_url,
    pricing_url: p.pricing_url || null,
    console_url: p.console_url || null,
    key_patterns: p.key_patterns,
    schema: p.schema,
    default_monthly_cap_usd: p.default_monthly_cap_usd ?? null,
    tiers: p.tiers || [],
  }));
}
