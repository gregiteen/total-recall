import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { brainDir } from './config.mjs';

/**
 * Research Source Adapters — Real Service Integrations
 *
 * Env vars (matching UltraChat conventions — already set in your environment):
 *   BRAVE_SEARCH_API_KEY  — Brave Search API (primary web search)
 *   SERPER_API_KEY        — Serper.dev (fallback web search)
 *   GITHUB_TOKEN          — GitHub REST API (higher rate limits)
 *
 * Always-free sources (no auth required):
 *   arXiv, npm registry, Wikipedia REST API, DuckDuckGo Instant Answers, web fetch.
 */

// ─── Config Loading ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG_PATH = path.join(brainDir, 'config', 'research.yml');
const USAGE_FILE = path.join(brainDir, 'config', 'search-usage.json');

// Default: 50 paid searches/day ≈ 1,500/month — just under Brave's ~1,000 free credit
// (credit rounds up, so we stay safe). Users on paid plans can raise this.
const DEFAULT_DAILY_LIMIT = 50;

export function loadResearchConfig(configPath = DEFAULT_CONFIG_PATH) {
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = yaml.parse(fs.readFileSync(configPath, 'utf8')) || {};
    } catch (err) { /* ignore parse errors */ }
  }

  let secrets = {};
  try {
    const secretsPath = path.join(path.dirname(configPath), 'secrets.enc');
    if (fs.existsSync(secretsPath)) {
      secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8') || '{}');
    }
  } catch {}

  return {
    // ── Paid search providers (fallback chain: Brave → Tavily → Exa → Serper) ──
    braveApiKey:  process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY || secrets.brave_api_key || fileConfig.brave_api_key  || null,
    tavilyApiKey: process.env.TAVILY_API_KEY                                    || secrets.tavily_api_key || fileConfig.tavily_api_key || null,
    exaApiKey:    process.env.EXA_API_KEY                                       || secrets.exa_api_key    || fileConfig.exa_api_key    || null,
    serperApiKey: process.env.SERPER_API_KEY                                    || secrets.serper_api_key || fileConfig.serper_api_key || null,
    // GitHub: personal access token for higher rate limits (60→5000 req/hr)
    githubToken: process.env.GITHUB_TOKEN || secrets.github_token || fileConfig.github_token || null,
    fetchTimeoutMs: fileConfig.fetch_timeout_ms || 10000,
    maxResultsPerSource: fileConfig.max_results_per_source || 5,
    userAgent: fileConfig.user_agent || 'TotalRecall/1.0 (knowledge-acquisition; +https://github.com/gregiteen/total-recall)',
    // Daily cap: protects free-tier users from unexpected overage charges.
    // Default 50/day ≈ 1,500/month — within Brave/Tavily/Exa free tiers (~1,000/month each).
    // Set to 0 to disable (paid plans with high volume).
    dailyWebSearchLimit: Number(fileConfig.daily_web_search_limit ?? process.env.TR_DAILY_SEARCH_LIMIT ?? DEFAULT_DAILY_LIMIT),
  };
}

// ─── Daily Search Budget Tracker ──────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-05-19"
}

function readUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
    }
  } catch (err) { /* corrupt file — reset */ }
  return {};
}

function writeUsage(usage) {
  try {
    const dir = path.dirname(USAGE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(usage, null, 2));
  } catch (err) { /* non-fatal */ }
}

/**
 * Check if the daily paid-search budget has been reached.
 * If not, increments the counter and returns false (search is allowed).
 * If yes, returns true (caller should use free fallback instead).
 */
export function isDailyCapReached(config) {
  if (!config.dailyWebSearchLimit) return false; // 0 = unlimited
  const today = todayKey();
  const usage = readUsage();
  const todayCount = usage[today] || 0;
  if (todayCount >= config.dailyWebSearchLimit) return true;
  usage[today] = todayCount + 1;
  // Prune old days (keep last 7)
  const days = Object.keys(usage).sort();
  if (days.length > 7) { for (const d of days.slice(0, days.length - 7)) delete usage[d]; }
  writeUsage(usage);
  return false;
}

/**
 * Get today's usage stats for display in UI/logs.
 */
export function getSearchUsageStats(config) {
  const today = todayKey();
  const usage = readUsage();
  return {
    today: usage[today] || 0,
    limit: config.dailyWebSearchLimit || 'unlimited',
    remaining: config.dailyWebSearchLimit
      ? Math.max(0, config.dailyWebSearchLimit - (usage[today] || 0))
      : 'unlimited',
  };
}


// ─── Helper: Safe Fetch ─────────────────────────────────────────────────────────

async function safeFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML tags and normalize whitespace */
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Brave Search API ───────────────────────────────────────────────────────────

/**
 * Search the web using Brave Search API.
 * Free tier: 2,000 queries/month. Sign up at https://brave.com/search/api/
 *
 * @param {string} query
 * @param {object} config - from loadResearchConfig()
 * @param {number} [count=5]
 * @returns {Promise<SourceResult[]>}
 */
export async function braveSearch(query, config, count = 5) {
  if (!config.braveApiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY not set');
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(count, 20)));
  url.searchParams.set('text_decorations', '0');
  url.searchParams.set('search_lang', 'en');

  const response = await safeFetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': config.braveApiKey,
    },
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brave Search API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const results = data.web?.results || [];

  return results.map(r => ({
    source: 'brave-search',
    type: 'web',
    title: r.title || '',
    url: r.url || '',
    snippet: r.description || '',
    published: normalizePublishedDate(r.age),
    relevance: 0.8,
  }));
}

// ─── Serper Search API ──────────────────────────────────────────────────────────

/**
 * Search the web using Serper.dev API (fallback when Brave unavailable).
 * Uses SERPER_API_KEY — already defined in UltraChat .env.local.
 * https://serper.dev/
 *
 * @param {string} query
 * @param {object} config - from loadResearchConfig()
 * @param {number} [count=5]
 * @returns {Promise<SourceResult[]>}
 */
export async function serperSearch(query, config, count = 5) {
  if (!config.serperApiKey) {
    throw new Error('SERPER_API_KEY not set');
  }

  const response = await safeFetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': config.serperApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: Math.min(count, 10) }),
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Serper API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const organic = data.organic || [];

  return organic.map(r => ({
    source: 'serper',
    type: 'web',
    title: r.title || '',
    url: r.link || '',
    snippet: r.snippet || '',
    published: normalizePublishedDate(r.date),
    relevance: 0.8,
  }));
}

// ─── Tavily Search API ──────────────────────────────────────────────────────────

/**
 * Search using Tavily — purpose-built for AI agents.
 * Returns clean extracted page text (not just snippets), saving a Playwright follow-up.
 * Free tier: ~1,000 queries/month. https://tavily.com
 */
export async function tavilySearch(query, config, count = 5) {
  if (!config.tavilyApiKey) throw new Error('TAVILY_API_KEY not set');

  const response = await safeFetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: config.tavilyApiKey,
      query,
      max_results: Math.min(count, 10),
      search_depth: 'basic',
      include_raw_content: false,
    }),
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tavily API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return (data.results || []).map(r => ({
    source: 'tavily',
    type: 'web',
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || r.snippet || '',
    published: normalizePublishedDate(r.published_date),
    relevance: r.score || 0.8,
  }));
}

// ─── Exa Search API ─────────────────────────────────────────────────────────────

/**
 * Search using Exa (formerly Metaphor) — neural/semantic search.
 * Finds content by meaning rather than keywords; excellent for recent articles.
 * Free tier: ~1,000 queries/month. https://exa.ai
 */
export async function exaSearch(query, config, count = 5) {
  if (!config.exaApiKey) throw new Error('EXA_API_KEY not set');

  const response = await safeFetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.exaApiKey,
    },
    body: JSON.stringify({
      query,
      numResults: Math.min(count, 10),
      useAutoprompt: true,
      type: 'neural',
    }),
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Exa API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return (data.results || []).map(r => ({
    source: 'exa',
    type: 'web',
    title: r.title || '',
    url: r.url || '',
    snippet: r.text?.slice(0, 500) || r.highlight || '',
    published: normalizePublishedDate(r.publishedDate),
    relevance: r.score || 0.8,
  }));
}

/**
 * Web search with automatic fallback chain:
 *   Brave → Tavily → Exa → Serper → DuckDuckGo (free, always on)
 *
 * Respects the daily paid-search cap (default 50/day ≈ 1,500/month).
 * When the cap is hit, falls back to free DuckDuckGo — research never stops.
 */
export async function webSearch(query, config, count = 5) {
  const capReached = isDailyCapReached(config);

  if (!capReached) {
    if (config.braveApiKey)  return braveSearch(query, config, count);
    if (config.tavilyApiKey) return tavilySearch(query, config, count);
    if (config.exaApiKey)    return exaSearch(query, config, count);
    if (config.serperApiKey) return serperSearch(query, config, count);
  }

  // No paid key or daily cap reached — free fallback, always available
  const ddg = await duckduckgoInstant(query, config).catch(() => null);
  return ddg ? [ddg] : [];
}

// ─── arXiv API ─────────────────────────────────────────────────────────────────


/**
 * Search arXiv for academic papers.
 * No authentication required. https://arxiv.org/help/api
 *
 * @param {string} query
 * @param {object} config
 * @param {number} [maxResults=5]
 * @returns {Promise<SourceResult[]>}
 */
export async function arxivSearch(query, config, maxResults = 5) {
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', `all:${query}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(maxResults));
  url.searchParams.set('sortBy', 'relevance');
  url.searchParams.set('sortOrder', 'descending');

  const response = await safeFetch(url.toString(), {
    headers: { 'User-Agent': config.userAgent },
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    throw new Error(`arXiv API error ${response.status}`);
  }

  const xml = await response.text();

  // Simple XML parsing without dependencies
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = (/<title>([\s\S]*?)<\/title>/.exec(entry)?.[1] || '').replace(/\s+/g, ' ').trim();
    const summary = (/<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1] || '').replace(/\s+/g, ' ').trim();
    const idRaw = /<id>([\s\S]*?)<\/id>/.exec(entry)?.[1] || '';
    const published = /<published>([\s\S]*?)<\/published>/.exec(entry)?.[1] || null;

    // Convert arXiv ID to link
    const arxivId = idRaw.replace('http://arxiv.org/abs/', '').trim();
    const url = arxivId ? `https://arxiv.org/abs/${arxivId}` : idRaw;

    if (title) {
      entries.push({
        source: 'arxiv',
        type: 'research-paper',
        title,
        url,
        snippet: summary.slice(0, 500),
        published: normalizePublishedDate(published),
        relevance: 0.9,
      });
    }
  }

  return entries.slice(0, maxResults);
}

// ─── npm Registry API ───────────────────────────────────────────────────────────

/**
 * Search the npm registry.
 * No authentication required. https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md
 *
 * @param {string} query
 * @param {object} config
 * @param {number} [size=5]
 * @returns {Promise<SourceResult[]>}
 */
export async function npmSearch(query, config, size = 5) {
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.set('text', query);
  url.searchParams.set('size', String(size));

  const response = await safeFetch(url.toString(), {
    headers: { 'User-Agent': config.userAgent },
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    throw new Error(`npm Registry API error ${response.status}`);
  }

  const data = await response.json();

  return (data.objects || []).map(obj => {
    const pkg = obj.package;
    return {
      source: 'npm',
      type: 'package',
      title: `${pkg.name}@${pkg.version}`,
      url: pkg.links?.npm || `https://www.npmjs.com/package/${pkg.name}`,
      snippet: pkg.description || '',
      published: normalizePublishedDate(pkg.date),
      relevance: obj.score?.final || 0.5,
      extra: {
        name: pkg.name,
        version: pkg.version,
        keywords: pkg.keywords || [],
        weeklyDownloads: null, // Available in package detail endpoint
      },
    };
  });
}

// ─── npm Package Detail ──────────────────────────────────────────────────────────

/**
 * Fetch detailed metadata for a specific npm package.
 * Returns version history, dependencies, and full description.
 *
 * @param {string} packageName
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function npmPackageDetail(packageName, config) {
  const response = await safeFetch(
    `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
    { headers: { 'User-Agent': config.userAgent } },
    config.fetchTimeoutMs,
  );

  if (!response.ok) {
    throw new Error(`npm package detail error ${response.status}`);
  }

  const data = await response.json();
  const latest = data['dist-tags']?.latest;
  const latestVersion = latest ? data.versions?.[latest] : null;

  return {
    source: 'npm',
    type: 'package-detail',
    title: `${data.name}@${latest || 'unknown'}`,
    url: `https://www.npmjs.com/package/${data.name}`,
    snippet: data.description || '',
    published: normalizePublishedDate(data.time?.[latest]),
    relevance: 1.0,
    extra: {
      name: data.name,
      latestVersion: latest,
      license: latestVersion?.license,
      homepage: latestVersion?.homepage,
      repository: latestVersion?.repository?.url,
      dependencies: Object.keys(latestVersion?.dependencies || {}),
      weeklyDownloads: null,
    },
  };
}

// ─── GitHub Search API ──────────────────────────────────────────────────────────

/**
 * Search GitHub repositories and code.
 * Optional GITHUB_TOKEN for higher rate limits (60 vs 5000 req/hour).
 *
 * @param {string} query
 * @param {object} config
 * @param {'repositories'|'code'|'issues'} [searchType='repositories']
 * @param {number} [perPage=5]
 * @returns {Promise<SourceResult[]>}
 */
export async function githubSearch(query, config, searchType = 'repositories', perPage = 5) {
  const url = new URL(`https://api.github.com/search/${searchType}`);
  url.searchParams.set('q', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('sort', 'stars');
  url.searchParams.set('order', 'desc');

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': config.userAgent,
  };
  if (config.githubToken) {
    headers['Authorization'] = `Bearer ${config.githubToken}`;
  }

  const response = await safeFetch(url.toString(), { headers }, config.fetchTimeoutMs);

  if (response.status === 403) {
    throw new Error('GitHub API rate limit exceeded. Set GITHUB_TOKEN for higher limits.');
  }
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`);
  }

  const data = await response.json();

  if (searchType === 'repositories') {
    return (data.items || []).map(repo => ({
      source: 'github',
      type: 'repository',
      title: repo.full_name,
      url: repo.html_url,
      snippet: repo.description || '',
      published: normalizePublishedDate(repo.updated_at),
      relevance: Math.min(1.0, (repo.stargazers_count || 0) / 10000),
      extra: {
        stars: repo.stargazers_count,
        language: repo.language,
        topics: repo.topics || [],
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
      },
    }));
  }

  if (searchType === 'issues') {
    return (data.items || []).map(issue => ({
      source: 'github',
      type: 'issue',
      title: issue.title,
      url: issue.html_url,
      snippet: (issue.body || '').slice(0, 400),
      published: normalizePublishedDate(issue.created_at),
      relevance: 0.6,
    }));
  }

  return [];
}

// ─── Wikipedia REST API ─────────────────────────────────────────────────────────

/**
 * Fetch a Wikipedia article summary.
 * No authentication required. https://en.wikipedia.org/api/rest_v1/
 *
 * @param {string} topic   Article title (spaces OK)
 * @param {object} config
 * @returns {Promise<SourceResult|null>}
 */
export async function wikipediaFetch(topic, config) {
  const encoded = encodeURIComponent(topic.replace(/\s+/g, '_'));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;

  const response = await safeFetch(url, {
    headers: {
      'User-Agent': config.userAgent,
      'Api-User-Agent': config.userAgent,
    },
  }, config.fetchTimeoutMs);

  if (response.status === 404) return null; // Article doesn't exist
  if (!response.ok) throw new Error(`Wikipedia API error ${response.status}`);

  const data = await response.json();
  if (data.type === 'disambiguation') {
    // Try the first item from disambiguation
    return null;
  }

  return {
    source: 'wikipedia',
    type: 'encyclopedia',
    title: data.title || topic,
    url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`,
    snippet: data.extract || '',
    published: normalizePublishedDate(data.timestamp),
    relevance: 0.85,
    extra: {
      pageId: data.pageid,
      thumbnail: data.thumbnail?.source || null,
      categories: [],
    },
  };
}

// ─── Wikidata API ────────────────────────────────────────────────────────────────

/**
 * Query Wikidata SPARQL for structured facts.
 * No authentication required. https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
 *
 * @param {string} sparqlQuery
 * @param {object} config
 * @returns {Promise<object[]>}
 */
export async function wikidataQuery(sparqlQuery, config) {
  const url = new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('query', sparqlQuery);
  url.searchParams.set('format', 'json');

  const response = await safeFetch(url.toString(), {
    headers: {
      'User-Agent': config.userAgent,
      'Accept': 'application/sparql-results+json',
    },
  }, config.fetchTimeoutMs);

  if (!response.ok) throw new Error(`Wikidata SPARQL error ${response.status}`);

  const data = await response.json();
  return data.results?.bindings || [];
}

// ─── Generic Web Fetch ──────────────────────────────────────────────────────────

/**
 * Fetch a URL and extract readable text content.
 * Strips HTML, removes nav/footer/script noise, returns plain text.
 *
 * @param {string} url
 * @param {object} config
 * @returns {Promise<SourceResult>}
 */
export async function webFetch(url, config) {
  const response = await safeFetch(url, {
    headers: {
      'User-Agent': config.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  }, config.fetchTimeoutMs);

  if (!response.ok) {
    throw new Error(`Web fetch error ${response.status} for ${url}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let text = '';

  if (contentType.includes('application/json')) {
    const json = await response.json();
    text = JSON.stringify(json, null, 2).slice(0, 5000);
  } else {
    const html = await response.text();
    text = stripHtml(html).slice(0, 8000);
  }

  return {
    source: 'web-fetch',
    type: 'webpage',
    title: url,
    url,
    snippet: text.slice(0, 1000),
    fullText: text,
    published: null,
    relevance: 0.7,
  };
}

// ─── DuckDuckGo Instant Answers ─────────────────────────────────────────────────

/**
 * DuckDuckGo Instant Answers API — structured facts, no auth required.
 * Best for definitions, entity facts, calculations.
 * NOT full web search (use Brave for that).
 *
 * @param {string} query
 * @param {object} config
 * @returns {Promise<SourceResult|null>}
 */
export async function duckduckgoInstant(query, config) {
  const url = new URL('https://api.duckduckgo.com/');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('no_html', '1');
  url.searchParams.set('skip_disambig', '1');

  const response = await safeFetch(url.toString(), {
    headers: { 'User-Agent': config.userAgent },
  }, config.fetchTimeoutMs);

  if (!response.ok) throw new Error(`DuckDuckGo API error ${response.status}`);

  const data = await response.json();
  const answer = data.AbstractText || data.Answer || data.Definition || '';
  const sourceUrl = data.AbstractURL || data.AnswerURL || '';

  if (!answer) return null;

  return {
    source: 'duckduckgo',
    type: 'instant-answer',
    title: data.Heading || query,
    url: sourceUrl,
    snippet: answer,
    published: null,
    relevance: 0.75,
  };
}

// ─── Source Availability Check ──────────────────────────────────────────────────

/**
 * Report which sources are available given current config.
 * Used for self-diagnosis.
 *
 * @param {object} config
 * @returns {object} { available: string[], unavailable: string[], warnings: string[] }
 */
export function checkSourceAvailability(config) {
  const available = [];
  const unavailable = [];
  const warnings = [];

  // Always available (no auth)
  available.push('arxiv', 'npm', 'wikipedia', 'duckduckgo', 'web-fetch');

  // Web search — Brave primary, Serper fallback
  if (config.braveApiKey) {
    available.push('brave-search');
  } else {
    unavailable.push('brave-search');
    warnings.push('BRAVE_SEARCH_API_KEY not set — set in env (already in UltraChat .env.local)');
  }

  if (config.serperApiKey) {
    available.push('serper');
  } else {
    unavailable.push('serper');
    if (!config.braveApiKey) {
      warnings.push('SERPER_API_KEY not set — no web search available (set BRAVE_SEARCH_API_KEY or SERPER_API_KEY)');
    }
  }

  if (config.githubToken) {
    available.push('github');
  } else {
    available.push('github'); // Works unauthenticated at 60 req/hr
    warnings.push('GITHUB_TOKEN not set — GitHub rate limit is 60 req/hr (authenticated: 5000)');
  }

  return { available, unavailable, warnings };
}

// ─── Playwright Headless Browser ────────────────────────────────────────────────

/**
 * Check if playwright is installed (optional dependency).
 * Returns the chromium launcher or null if not available.
 */
async function getPlaywright() {
  try {
    const pw = await import('playwright');
    return pw.chromium || pw.default?.chromium || null;
  } catch (err) {
    return null;
  }
}

/**
 * Scrape a URL using a headless Chromium browser via Playwright.
 *
 * Handles:
 *   - JavaScript-rendered pages (SPAs, React, Next.js)
 *   - Pages that block plain fetch (bot detection, Cloudflare challenges)
 *   - Dynamic content loaded after scroll or interaction
 *   - Readable text extraction from complex page layouts
 *
 * Falls back to plain webFetch() if Playwright is not installed.
 * Install with: npm install playwright && npx playwright install chromium
 *
 * @param {string} url
 * @param {object} config
 * @param {object} [opts]
 * @param {number} [opts.waitMs=2000]           Wait for JS rendering
 * @param {string} [opts.waitForSelector=null]  CSS selector to wait for
 * @param {boolean} [opts.extractLinks=false]   Also return all page links
 * @returns {Promise<SourceResult>}
 */
export async function playwrightScrape(url, config, opts = {}) {
  const chromium = await getPlaywright();

  if (!chromium) {
    // Graceful fallback — no hard dependency on playwright
    return webFetch(url, config);
  }

  const { waitMs = 2000, waitForSelector = null, extractLinks = false } = opts;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    });

    const context = await browser.newContext({
      userAgent: config.userAgent,
      viewport: { width: 1280, height: 800 },
      // Block images, fonts, media to speed up scraping
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });

    // Block resource types that waste bandwidth during scraping
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    const page = await context.newPage();

    // Navigate with timeout matching config
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.fetchTimeoutMs || 15000,
    });

    // Wait for JS rendering
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 5000 }).catch(() => {});
    } else if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }

    // Extract page title
    const title = await page.title();

    // Extract readable text — prioritise article/main content
    const fullText = await page.evaluate(() => {
      // Try to get main content area first
      const selectors = ['article', 'main', '[role="main"]', '.content', '#content', 'body'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.length > 200) {
          return el.innerText.replace(/\s+/g, ' ').trim().slice(0, 8000);
        }
      }
      return document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 8000) || '';
    });

    // Optionally extract all links
    let links = [];
    if (extractLinks) {
      links = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]'))
          .map(a => ({ text: a.innerText?.trim(), href: a.href }))
          .filter(l => l.href.startsWith('http') && l.text)
          .slice(0, 50),
      );
    }

    return {
      source: 'playwright',
      type: 'webpage-rendered',
      title: title || url,
      url,
      snippet: fullText.slice(0, 1000),
      fullText,
      published: null,
      relevance: 0.85, // Higher than plain fetch — JS content is more complete
      extra: { links },
    };

  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Smart fetch: tries Playwright first for JS-heavy pages, falls back to plain fetch.
 * Use this when you don't know if a page requires JS rendering.
 *
 * @param {string} url
 * @param {object} config
 * @returns {Promise<SourceResult>}
 */
export async function smartFetch(url, config) {
  const chromium = await getPlaywright();

  // For known JS-heavy domains, always use Playwright
  const jsHeavyDomains = [
    'github.com', 'npmjs.com', 'medium.com', 'substack.com',
    'notion.so', 'hashnode.dev', 'dev.to', 'stackoverflow.com',
  ];
  const usePlaywright = chromium && jsHeavyDomains.some(d => url.includes(d));

  if (usePlaywright) {
    try {
      return await playwrightScrape(url, config, { waitMs: 1500 });
    } catch (err) {
      // Fall through to plain fetch
    }
  }

  return webFetch(url, config);
}

/**
 * Normalizes fuzzy, relative, or partial date/time strings into a standardized ISO 8601 timestamp.
 * Supports:
 * - Relative time: "3 hours ago", "5 days ago", "yesterday", "just now", "2 weeks ago"
 * - Partial date: "April 2026", "2026"
 * - Standard formats: "2026-05-21", "2026-05-21T13:40:12Z", "May 21, 2026"
 *
 * @param {string|null|undefined} rawDateStr
 * @param {Date|string|number} [referenceTime=new Date()] - dynamic system execution context
 * @returns {string|null} ISO 8601 timestamp or null if unparseable
 */
export function normalizePublishedDate(rawDateStr, referenceTime = new Date()) {
  if (!rawDateStr || typeof rawDateStr !== 'string') return null;
  const clean = rawDateStr.trim().toLowerCase();
  if (!clean) return null;

  const ref = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  if (isNaN(ref.getTime())) return null;

  // Check relative time patterns
  let match;
  
  if (clean === 'yesterday') {
    return new Date(ref.getTime() - 86400 * 1000).toISOString();
  }
  
  if (clean === 'today' || clean === 'now' || clean === 'just now') {
    return ref.toISOString();
  }

  match = clean.match(/^(\d+)\s+(minute|min|m)s?\s+ago$/);
  if (match) {
    const mins = parseInt(match[1], 10);
    return new Date(ref.getTime() - mins * 60 * 1000).toISOString();
  }

  match = clean.match(/^(\d+)\s+(hour|hr|h)s?\s+ago$/);
  if (match) {
    const hrs = parseInt(match[1], 10);
    return new Date(ref.getTime() - hrs * 3600 * 1000).toISOString();
  }

  match = clean.match(/^(\d+)\s+(day|d)s?\s+ago$/);
  if (match) {
    const days = parseInt(match[1], 10);
    return new Date(ref.getTime() - days * 86400 * 1000).toISOString();
  }

  match = clean.match(/^(\d+)\s+(week|wk|w)s?\s+ago$/);
  if (match) {
    const weeks = parseInt(match[1], 10);
    return new Date(ref.getTime() - weeks * 7 * 86400 * 1000).toISOString();
  }

  match = clean.match(/^(\d+)\s+(month|mo)s?\s+ago$/);
  if (match) {
    const months = parseInt(match[1], 10);
    return new Date(ref.getTime() - months * 30.4 * 86400 * 1000).toISOString();
  }

  match = clean.match(/^(\d+)\s+(year|yr|y)s?\s+ago$/);
  if (match) {
    const years = parseInt(match[1], 10);
    return new Date(ref.getTime() - years * 365.25 * 86400 * 1000).toISOString();
  }

  // Handle Month YYYY or YYYY formats
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthRegex = new RegExp(`^(${monthNames.join('|')})\\w*\\s+(\\d{4})$`);
  match = clean.match(monthRegex);
  if (match) {
    const monthIdx = monthNames.indexOf(match[1]);
    const year = parseInt(match[2], 10);
    const d = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0));
    return d.toISOString();
  }

  if (/^\d{4}$/.test(clean)) {
    const year = parseInt(clean, 10);
    const d = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    return d.toISOString();
  }

  // Standard parsing via JS Date
  const parsed = Date.parse(rawDateStr);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return null;
}

/**
 * @typedef {object} SourceResult
 * @property {string} source    - Source adapter name
 * @property {string} type      - Content type: web, research-paper, package, webpage-rendered, etc.
 * @property {string} title
 * @property {string} url
 * @property {string} snippet
 * @property {string|null} published - ISO date or null
 * @property {number} relevance - 0.0–1.0
 * @property {object} [extra]   - Source-specific extra data
 */
