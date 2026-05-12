/**
 * MCP Spec Watcher — Continuous Intelligence Subagent
 *
 * Polls the official MCP SDK and specification GitHub repositories
 * for new releases. If a new version is detected:
 *   1. Logs the finding to stderr
 *   2. Fetches the changelog
 *   3. Calls the local Gemma kernel to update SKILL.md
 *
 * Triggered daily at midnight via the OS daemon cron system.
 *
 * Monitored repos:
 *   - modelcontextprotocol/typescript-sdk (SDK releases)
 *   - modelcontextprotocol/specification  (Spec changes)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_FILE = path.join(__dirname, '..', 'SKILL.md');
const STATE_FILE = path.join(__dirname, '..', '.watch-state.json');

const REPOS = [
  { owner: 'modelcontextprotocol', repo: 'typescript-sdk', label: 'SDK' },
  { owner: 'modelcontextprotocol', repo: 'specification', label: 'Spec' }
];

const GITHUB_API = 'https://api.github.com';

/**
 * Load the persisted watch state (last known versions).
 */
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Save watch state.
 */
function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Fetch the latest release tag from a GitHub repository.
 * Returns { tag, changelog, url } or null on failure.
 */
async function fetchLatestRelease(owner, repo) {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/releases/latest`, {
      headers: {
        'User-Agent': 'Total-Recall-MCP-Watcher/2.0',
        'Accept': 'application/vnd.github+json'
      }
    });

    if (res.status === 404) {
      // Repo may use tags instead of releases — try tags
      const tagRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/tags?per_page=1`, {
        headers: {
          'User-Agent': 'Total-Recall-MCP-Watcher/2.0',
          'Accept': 'application/vnd.github+json'
        }
      });

      if (!tagRes.ok) return null;
      const tags = await tagRes.json();
      if (!tags.length) return null;

      return {
        tag: tags[0].name,
        changelog: '(No release notes — tag only. Check the repo for details.)',
        url: `https://github.com/${owner}/${repo}/releases/tag/${tags[0].name}`
      };
    }

    if (!res.ok) {
      console.error(`[MCP Watcher] GitHub API error for ${owner}/${repo}: ${res.status}`);
      return null;
    }

    const release = await res.json();
    return {
      tag: release.tag_name,
      changelog: release.body || '(No release notes)',
      url: release.html_url
    };
  } catch (err) {
    console.error(`[MCP Watcher] Fetch error for ${owner}/${repo}: ${err.message}`);
    return null;
  }
}

/**
 * Request the local Gemma kernel to update the SKILL.md with new spec info.
 */
async function requestSkillUpdate(currentContent, updates) {
  const updateSummary = updates.map(u =>
    `### ${u.label} — ${u.tag}\nURL: ${u.url}\n\nChangelog:\n${u.changelog}`
  ).join('\n\n---\n\n');

  try {
    const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma',
        messages: [
          {
            role: 'system',
            content: [
              'You are the MCP Expert Skill Maintainer for Total Recall.',
              'You are given the current SKILL.md file and changelog(s) from new SDK/spec releases.',
              'Your job:',
              '1. Update the "Last Verified SDK Version" in the header to match the new SDK version.',
              '2. Add a new entry to the Changelog section at the top of the changelog list.',
              '3. If there are BREAKING CHANGES, update the relevant sections (transport, tools, resources, prompts, pitfalls).',
              '4. If changes are minor, just update the version and changelog — do NOT rewrite working sections.',
              '5. Preserve ALL existing content, code examples, and pitfalls unless they are factually wrong.',
              '6. Output ONLY the raw markdown file content (no codeblock wrappers).',
              '7. The frontmatter (name, description) MUST remain exactly as-is.'
            ].join('\n')
          },
          {
            role: 'user',
            content: `Current SKILL.md:\n\n${currentContent}\n\n---\n\nNew Release(s):\n\n${updateSummary}`
          }
        ],
        temperature: 0.1
      })
    });

    const json = await res.json();
    const updated = json.choices?.[0]?.message?.content;

    if (updated) {
      // Strip codeblock wrappers if the LLM wrapped the output
      const clean = updated
        .replace(/^```(?:markdown|md)?\n?/g, '')
        .replace(/\n?```$/g, '');
      return clean;
    }
  } catch (err) {
    console.error(`[MCP Watcher] Kernel update request failed: ${err.message}`);
  }
  return null;
}

/**
 * Main watcher entry point.
 */
export async function checkMcpUpdates() {
  console.error('[MCP Watcher] Checking for updates...');

  const state = loadState();
  const updates = [];

  for (const { owner, repo, label } of REPOS) {
    const release = await fetchLatestRelease(owner, repo);
    if (!release) continue;

    const stateKey = `${owner}/${repo}`;
    const knownVersion = state[stateKey];

    if (knownVersion === release.tag) {
      console.error(`[MCP Watcher] ${label}: up-to-date (${release.tag})`);
      continue;
    }

    console.error(`[MCP Watcher] ${label}: NEW VERSION DETECTED — ${knownVersion || '(unknown)'} → ${release.tag}`);
    updates.push({ label, ...release });
    state[stateKey] = release.tag;
  }

  if (updates.length === 0) {
    console.error('[MCP Watcher] All repositories up-to-date. No action needed.');
    saveState(state);
    return { updated: false };
  }

  // Read current skill content
  let currentContent = '';
  try {
    currentContent = fs.readFileSync(SKILL_FILE, 'utf8');
  } catch {
    console.error('[MCP Watcher] WARNING: SKILL.md not found. Skipping auto-update.');
    saveState(state);
    return { updated: false, error: 'SKILL.md not found' };
  }

  // Request kernel update
  const updatedContent = await requestSkillUpdate(currentContent, updates);

  if (updatedContent) {
    fs.writeFileSync(SKILL_FILE, updatedContent);
    console.error(`[MCP Watcher] ✅ SKILL.md updated for: ${updates.map(u => `${u.label} ${u.tag}`).join(', ')}`);
    saveState(state);
    return { updated: true, versions: updates.map(u => ({ label: u.label, tag: u.tag })) };
  }

  console.error('[MCP Watcher] ⚠️ Kernel did not return updated content. State saved, will retry next cycle.');
  saveState(state);
  return { updated: false, error: 'Kernel returned empty response' };
}

// ─── Direct execution ───────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkMcpUpdates()
    .then(result => console.error('[MCP Watcher] Result:', JSON.stringify(result)))
    .catch(err => console.error('[MCP Watcher] Fatal:', err));
}
