/**
 * Per-provider rotation recipes.
 *
 * A recipe describes how to obtain a NEW credential from a provider console and
 * how to prove the new value works. Recipes are data, not bespoke code, so
 * adding a provider is a catalog edit rather than a new module.
 *
 * `verified: true` means the selectors were confirmed against the live console
 * and TR may drive the flow autonomously. `verified: false` means TR opens the
 * console, tells the human exactly what to click, and detects the result — it
 * must NEVER blind-click guessed selectors on a billing or payments dashboard.
 *
 * Never log secret values.
 */

/**
 * @typedef {{
 *   provider: string,
 *   console_url: string,
 *   verified: boolean,
 *   signed_in?: string,
 *   signed_out?: string,
 *   create_hint: string,
 *   revoke_hint?: string,
 *   value_pattern?: RegExp,
 *   create?: (page: any, ctx: { label: string }) => Promise<string|null>,
 *   verify?: (value: string) => Promise<boolean>,
 * }} RotationRecipe
 */

/** Probe helper — returns true when the credential authenticates. */
async function probe(url, headers, okStatuses = [200]) {
  try {
    const res = await fetch(url, { headers });
    return okStatuses.includes(res.status);
  } catch {
    return false;
  }
}

const bearer = (v) => ({ Authorization: `Bearer ${v}` });

/** @type {Record<string, RotationRecipe>} */
export const ROTATION_RECIPES = {
  openrouter: {
    provider: 'openrouter',
    console_url: 'https://openrouter.ai/settings/keys',
    verified: true,
    signed_in: 'button:has-text("New Key")',
    signed_out: 'a:has-text("Sign in")',
    create_hint: 'Click "New Key", name it, then copy the value shown once.',
    revoke_hint: 'Open the ⋮ menu on the old key row and choose Delete.',
    value_pattern: /^sk-or-v1-[a-f0-9]{64}$/,
    async create(page, { label }) {
      await page.getByRole('button', { name: /new key/i }).click();
      const name = page.getByRole('textbox').first();
      await name.fill(label);
      await page.getByRole('button', { name: /^create$/i }).click();
      // The value is displayed exactly once, in a readonly field.
      const field = page.locator('input[readonly], textarea[readonly]').first();
      await field.waitFor({ state: 'visible', timeout: 15_000 });
      return (await field.inputValue()) || null;
    },
    verify: (v) => probe('https://openrouter.ai/api/v1/auth/key', bearer(v)),
  },

  github: {
    provider: 'github',
    console_url: 'https://github.com/settings/tokens',
    verified: false,
    signed_in: 'summary[aria-label*="user" i], img.avatar-user',
    signed_out: 'form[action="/session"]',
    create_hint:
      'Generate new token (classic) → set the same scopes as the old token → Generate → copy the ghp_… value.',
    revoke_hint: 'Delete the old token row once TR confirms the new value is stored.',
    value_pattern: /^gh[ps]_[A-Za-z0-9]{36,}$/,
    verify: (v) => probe('https://api.github.com/user', { ...bearer(v), 'User-Agent': 'total-recall' }),
  },

  stripe: {
    provider: 'stripe',
    console_url: 'https://dashboard.stripe.com/apikeys',
    verified: false,
    signed_in: 'text=/API keys/i',
    signed_out: 'input[name="email"]',
    create_hint:
      'Roll the secret key. Set the old key to expire in ~1 hour (NOT immediately) so live traffic keeps working during the swap, then copy the new sk_live_… value.',
    revoke_hint: 'The roll schedules the old key for expiry — no separate revoke needed.',
    value_pattern: /^sk_(live|test)_[A-Za-z0-9]{24,}$/,
    verify: (v) => probe('https://api.stripe.com/v1/account', bearer(v)),
  },

  openai: {
    provider: 'openai',
    console_url: 'https://platform.openai.com/api-keys',
    verified: false,
    create_hint: 'Create new secret key → copy the sk-… value shown once.',
    value_pattern: /^sk-[A-Za-z0-9_-]{20,}$/,
    verify: (v) => probe('https://api.openai.com/v1/models', bearer(v)),
  },

  anthropic: {
    provider: 'anthropic',
    console_url: 'https://console.anthropic.com/settings/keys',
    verified: false,
    create_hint: 'Create Key → copy the sk-ant-… value shown once.',
    value_pattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    verify: (v) => probe('https://api.anthropic.com/v1/models', { 'x-api-key': v, 'anthropic-version': '2023-06-01' }),
  },

  digitalocean: {
    provider: 'digitalocean',
    console_url: 'https://cloud.digitalocean.com/account/api/tokens',
    verified: false,
    create_hint: 'Generate New Token → full scopes as needed → copy the dop_v1_… value.',
    value_pattern: /^dop_v1_[a-f0-9]{64}$/,
    verify: (v) => probe('https://api.digitalocean.com/v2/account', bearer(v)),
  },

  vercel: {
    provider: 'vercel',
    console_url: 'https://vercel.com/account/settings/tokens',
    verified: false,
    create_hint: 'Create Token → set scope and expiry → copy the value shown once.',
    verify: (v) => probe('https://api.vercel.com/v2/user', bearer(v)),
  },

  supabase: {
    provider: 'supabase',
    console_url: 'https://supabase.com/dashboard/account/tokens',
    verified: false,
    create_hint: 'Generate new token → copy the sbp_… value shown once.',
    value_pattern: /^sbp_[a-f0-9]{40,}$/,
    verify: (v) => probe('https://api.supabase.com/v1/organizations', bearer(v)),
  },

  elevenlabs: {
    provider: 'elevenlabs',
    console_url: 'https://elevenlabs.io/app/settings/api-keys',
    verified: false,
    create_hint: 'Create API key → copy the value shown once.',
    verify: (v) => probe('https://api.elevenlabs.io/v1/user', { 'xi-api-key': v }),
  },

  brave: {
    provider: 'brave',
    console_url: 'https://api-dashboard.search.brave.com/app/keys',
    verified: false,
    create_hint: 'Add API key → copy the value.',
    verify: (v) =>
      probe('https://api.search.brave.com/res/v1/web/search?q=test', {
        'X-Subscription-Token': v,
        Accept: 'application/json',
      }),
  },

  huggingface: {
    provider: 'huggingface',
    console_url: 'https://huggingface.co/settings/tokens',
    verified: false,
    create_hint: 'New token → set role → copy the hf_… value.',
    value_pattern: /^hf_[A-Za-z0-9]{30,}$/,
    verify: (v) => probe('https://huggingface.co/api/whoami-v2', bearer(v)),
  },

  telnyx: {
    provider: 'telnyx',
    console_url: 'https://portal.telnyx.com/#/app/api-keys',
    verified: false,
    create_hint: 'Create API Key → copy the KEY… value shown once.',
    verify: (v) => probe('https://api.telnyx.com/v2/whoami', bearer(v)),
  },

  fal: {
    provider: 'fal',
    console_url: 'https://fal.ai/dashboard/keys',
    verified: false,
    create_hint: 'Add key → copy the value shown once.',
  },

  tavily: {
    provider: 'tavily',
    console_url: 'https://app.tavily.com/home',
    verified: false,
    create_hint: 'Create API key → copy the tvly-… value.',
    value_pattern: /^tvly-[A-Za-z0-9]{20,}$/,
  },

  exa: {
    provider: 'exa',
    console_url: 'https://dashboard.exa.ai/api-keys',
    verified: false,
    create_hint: 'Create API key → copy the value.',
  },

  serper: {
    provider: 'serper',
    console_url: 'https://serper.dev/api-key',
    verified: false,
    create_hint: 'Copy or regenerate the API key.',
  },

  npm: {
    provider: 'npm',
    console_url: 'https://www.npmjs.com/settings/~/tokens',
    verified: false,
    create_hint: 'Generate New Token → Granular/Classic → copy the npm_… value.',
    value_pattern: /^npm_[A-Za-z0-9]{36}$/,
  },

  pexels: {
    provider: 'pexels',
    console_url: 'https://www.pexels.com/api/new/',
    verified: false,
    create_hint: 'Request/regenerate the API key and copy it.',
  },

  'browser-use': {
    provider: 'browser-use',
    console_url: 'https://cloud.browser-use.com/settings/api-keys',
    verified: false,
    create_hint: 'Create API key → copy the value.',
  },

  'artificial-analysis': {
    provider: 'artificial-analysis',
    console_url: 'https://artificialanalysis.ai/account/api-keys',
    verified: false,
    create_hint: 'Create API key → copy the value.',
  },

  google: {
    provider: 'google',
    console_url: 'https://aistudio.google.com/app/apikey',
    verified: false,
    create_hint: 'Create API key → select project → copy the AIza… value.',
    value_pattern: /^AIza[A-Za-z0-9_-]{30,}$/,
    verify: (v) =>
      probe(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(v)}`, {}),
  },

  smtp2go: {
    provider: 'smtp2go',
    console_url: 'https://app.smtp2go.com/settings/apikeys/',
    verified: false,
    create_hint: 'Add API Key → set permissions → copy the api-… value.',
    value_pattern: /^api-[A-Za-z0-9]{20,}$/,
  },

  xai: {
    provider: 'xai',
    console_url: 'https://console.x.ai',
    verified: false,
    create_hint: 'API Keys → Create API key → copy the xai-… value.',
    value_pattern: /^xai-[A-Za-z0-9]{20,}$/,
    verify: (v) => probe('https://api.x.ai/v1/models', bearer(v)),
  },

  telegram: {
    provider: 'telegram',
    console_url: 'https://t.me/BotFather',
    verified: false,
    // Bot tokens are reissued by messaging @BotFather, not on a web console —
    // TR can open the link but the exchange happens inside Telegram.
    create_hint: 'Message @BotFather → /revoke → pick the bot → copy the reissued token.',
    revoke_hint: '/revoke already invalidates the previous token — no separate step.',
    value_pattern: /^\d{6,}:[A-Za-z0-9_-]{30,}$/,
    verify: (v) => probe(`https://api.telegram.org/bot${encodeURIComponent(v)}/getMe`, {}),
  },
};

/**
 * @param {string} providerId
 * @returns {RotationRecipe|null}
 */
export function getRecipe(providerId) {
  if (!providerId) return null;
  return ROTATION_RECIPES[String(providerId).toLowerCase()] || null;
}

/** Providers whose flows TR may drive without a human watching each click. */
export function listVerifiedRecipes() {
  return Object.values(ROTATION_RECIPES).filter((r) => r.verified).map((r) => r.provider);
}

/**
 * Validate a captured value against the provider's expected shape.
 * A shape mismatch usually means the wrong DOM node was read — treat as failure
 * rather than storing garbage over a working credential.
 *
 * @param {RotationRecipe|null} recipe
 * @param {string} value
 */
export function valueLooksValid(recipe, value) {
  if (!value || typeof value !== 'string') return false;
  if (value.length < 12) return false;
  if (recipe?.value_pattern) return recipe.value_pattern.test(value);
  return true;
}
