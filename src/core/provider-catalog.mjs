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
export function providerForKeyName(keyName) {
  const k = String(keyName || '').toUpperCase();
  for (const p of PROVIDER_CATALOG) {
    if (p.key_patterns.some((pat) => pat.toUpperCase() === k || k.includes(pat.replace(/_API_KEY$/, '')))) {
      return p;
    }
  }
  // fuzzy
  for (const p of PROVIDER_CATALOG) {
    if (k.includes(p.id.toUpperCase().replace('-', '_'))) return p;
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
