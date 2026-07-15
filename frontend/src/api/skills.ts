// ─── Skills domain ────────────────────────────────────────────────────────────

import { apiFetch, API_BASE } from './_base'

export interface ProjectSkill {
  id: string
  name: string
  repo: string
  project_path?: string
  source?: string
  skill_dir?: string
  has_skill_md?: boolean
  size?: number
  modified?: string
  isDirectory?: boolean
  subSkills?: string[]
}

export interface SkillsCatalog {
  repos: {
    repo: string
    path: string | null
    skills: ProjectSkill[]
    ok?: boolean
    count?: number
    error?: string
  }[]
  skills: ProjectSkill[]
  total: number
  excluded_note?: string
}

export async function listSkills(): Promise<SkillsCatalog | ProjectSkill[]> {
  const res = await apiFetch(API_BASE + '/api/skills')
  if (!res.ok) throw new Error(`Skills API error: ${res.status}`)
  return res.json()
}

export async function fetchSkill(
  name: string,
  repo?: string,
): Promise<{ name: string; content: string; repo?: string }> {
  const q = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  const res = await apiFetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}${q}`)
  if (!res.ok) throw new Error(`Skill fetch API error: ${res.status}`)
  return res.json()
}

export async function fetchSkillFiles(
  name: string,
  dir: string,
  repo?: string,
): Promise<{ name: string; size: string; isDirectory: boolean }[]> {
  const params = new URLSearchParams({ dir })
  if (repo) params.set('repo', repo)
  const res = await apiFetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}/files?${params}`)
  if (!res.ok) throw new Error(`Skill files fetch API error: ${res.status}`)
  return res.json()
}

export async function saveSkill(name: string, content: string, repo?: string): Promise<void> {
  const q = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  const res = await apiFetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}${q}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, repo }),
  })
  if (!res.ok) throw new Error(`Skill save API error: ${res.status}`)
}

export async function deleteSkill(name: string, repo?: string): Promise<void> {
  const q = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  const res = await apiFetch(`${API_BASE}/api/skills/${encodeURIComponent(name)}${q}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Skill delete API error: ${res.status}`)
}

/**
 * Queries the skills.sh registry sorted by absolute installs rating.
 *
 * @param query - The keyword or package name search term to locate in the registry.
 * @returns A promise resolving to an array of matching registry skill records.
 */
export async function searchSkillsRegistry(query: string): Promise<unknown[]> {
  const params = new URLSearchParams({ q: query })
  const res = await apiFetch(`${API_BASE}/api/skills/search?${params}`)
  if (!res.ok) throw new Error(`Registry search API error: ${res.status}`)
  return res.json()
}

/**
 * Automates downloading a package from skills.sh, executing static security checks,
 * quarantining vulnerable files, and hot-recompiling the active brain shims.
 *
 * @param pkg - The package name format (e.g. "owner/repo@skill" or "owner/repo").
 * @returns A promise resolving to the status result containing success indicators and logs.
 */
export async function installRegistrySkill(pkg: string): Promise<{ success: boolean; reason?: string; skillName?: string; path?: string }> {
  const res = await apiFetch(`${API_BASE}/api/skills/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pkg }),
  })
  if (!res.ok) throw new Error(`Registry installation API error: ${res.status}`)
  return res.json()
}

export async function toggleSkillRepo(skillName: string, targetRepo: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/api/skills/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillName, targetRepo, enabled })
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function previewSkillRepo(skillName: string, targetRepo: string): Promise<{ success: boolean; original: string; preview: string; signals: string[] }> {
  const res = await apiFetch(`${API_BASE}/api/skills/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillName, targetRepo })
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function auditSkill(skillName: string, repoPath?: string): Promise<{ success: boolean; audit: { outdated: boolean; problematic: boolean; reason: string; proposed_changes: string } }> {
  const res = await apiFetch(`${API_BASE}/api/skills/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skillName, repoPath })
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function generateExpert(repoPath: string, force?: boolean): Promise<{ success: boolean; message: string; stats: Record<string, number> }> {
  const res = await apiFetch(`${API_BASE}/api/skills/generate-expert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoPath, force })
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
