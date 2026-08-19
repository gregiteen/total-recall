// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally before importing API functions
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

// Import from the barrel
import {
  // _base
  getApiBase,
  setApiBase,
  registerUnauthedCallback,
  clearUnauthedCallback,
  // auth
  checkSession,
  login,
  logout,
  changePassword,
  getAuthStatus,
  setupPassword,
  // chat
  sendChat,
  fetchChatHistory,
  fetchChatThreads,
  deleteChatThread,
  fetchChatSuggestions,
  fetchTtsStatus,
  fetchTtsAudio,
  // memory
  listMemory,
  searchMemory,
  readMemory,
  saveMemory,
  createMemory,
  deleteMemory,
  fetchMemoryStats,
  fetchGraph,
  fetchConflicts,
  resolveConflict,
  fetchVaultStatus,
  fetchOpenWikiNodes,
  // sandbox
  runSandbox,
  // skills
  listSkills,
  fetchSkill,
  fetchSkillFiles,
  saveSkill,
  deleteSkill,
  searchSkillsRegistry,
  installRegistrySkill,
  toggleSkillRepo,
  auditSkill,
  // keys
  listApiKeys,
  issueApiKey,
  revokeApiKey,
  scanEnvSecrets,
  parseEnvPaste,
  importEnvSecrets,
  fetchSecretsCatalog,
  updateSecretMeta,
  rotateSecretValue,
  deleteProviderSecret,
  recordSecretUsage,
  exportEnvFromSecrets,
  fetchRotationDue,
  enqueueRotationDue,
  revealSecretValue,
  fetchWebAuthnStatus,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
  webauthnAssertOptions,
  webauthnAssertVerify,
  webauthnPasswordStepUp,
  deletePasskey,
  // research
  listResearch,
  createResearch,
  patchResearch,
  deleteResearch,
  // system
  fetchHealth,
  fetchUsageStats,
  fetchLogs,
  triggerRecompile,
  triggerDream,
  runAgentDiagnostics,
  restartDaemon,
  fetchBrains,
  listTasks,
  createTask,
  listFiles,
  listScripts,
  readScript,
  saveScript,
  runScript,
  shareToApi,
  runOkfLint,
  triggerOkfExport,
  postDecision,
  // update
  checkUpdate,
  runUpdate,
  // models
  fetchGeminiModels,
  fetchClaudeModels,
  fetchOpenaiModels,
  fetchOpenRouterModels,
  // docs
  fetchDesignDocs,
  fetchDesignDocContent,
  fetchDocs,
  readDoc,
  createDoc,
  updateDoc,
  deleteDoc,
  fetchViews,
  createView,
  deleteView,
  fetchInstructions,
  fetchInstructionContent,
  fetchHelpTopics,
  fetchHelpContent,
  // extension
  fetchExtensionStatus,
  // sessions
  fetchSessions,
  deleteSession,
  // integrations
  connectClient,
  fetchActiveIntegrations,
  // config
  fetchConfig,
  saveConfig,
  fetchConfigJson,
  saveConfigJson,
} from './index'

function makeOkResponse(body: unknown = {}) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob()),
  } as Response)
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockImplementation(() => makeOkResponse())
})

describe('API barrel exports — all functions exist', () => {
  const fns = [
    // _base
    getApiBase, setApiBase, registerUnauthedCallback, clearUnauthedCallback,
    // auth
    checkSession, login, logout, changePassword, getAuthStatus, setupPassword,
    // chat
    sendChat, fetchChatHistory, fetchChatThreads, deleteChatThread, fetchChatSuggestions,
    fetchTtsStatus, fetchTtsAudio,
    // memory
    listMemory, searchMemory, readMemory, saveMemory, createMemory, deleteMemory,
    fetchMemoryStats, fetchGraph, fetchConflicts, resolveConflict, fetchVaultStatus, fetchOpenWikiNodes,
    // sandbox
    runSandbox,
    // skills
    listSkills, fetchSkill, fetchSkillFiles, saveSkill, deleteSkill,
    searchSkillsRegistry, installRegistrySkill, toggleSkillRepo, auditSkill,
    // keys
    listApiKeys, issueApiKey, revokeApiKey, scanEnvSecrets, parseEnvPaste, importEnvSecrets,
    fetchSecretsCatalog, updateSecretMeta, rotateSecretValue, deleteProviderSecret, recordSecretUsage,
    exportEnvFromSecrets, fetchRotationDue, enqueueRotationDue, revealSecretValue,
    fetchWebAuthnStatus, webauthnRegisterOptions, webauthnRegisterVerify,
    webauthnAssertOptions, webauthnAssertVerify, webauthnPasswordStepUp, deletePasskey,
    // research
    listResearch, createResearch, patchResearch, deleteResearch,
    // system
    fetchHealth, fetchUsageStats, fetchLogs, triggerRecompile, triggerDream, runAgentDiagnostics, restartDaemon,
    fetchBrains, listTasks, createTask, listFiles, listScripts, readScript, saveScript, runScript,
    shareToApi, runOkfLint, triggerOkfExport, postDecision,
    // update
    checkUpdate, runUpdate,
    // models
    fetchGeminiModels, fetchClaudeModels, fetchOpenaiModels, fetchOpenRouterModels,
    // docs
    fetchDesignDocs, fetchDesignDocContent, fetchDocs, readDoc, createDoc, updateDoc, deleteDoc,
    fetchViews, createView, deleteView, fetchInstructions, fetchInstructionContent,
    fetchHelpTopics, fetchHelpContent,
    // extension
    fetchExtensionStatus,
    // sessions
    fetchSessions, deleteSession,
    // integrations
    connectClient, fetchActiveIntegrations,
    // config
    fetchConfig, saveConfig, fetchConfigJson, saveConfigJson,
  ]

  it('exports all functions as typeof function', () => {
    for (const fn of fns) {
      expect(typeof fn, `${fn.name} should be a function`).toBe('function')
    }
  })
})

describe('checkSession', () => {
  it('returns true when fetch succeeds with ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true } as Response)
    const result = await checkSession()
    expect(result).toBe(true)
  })

  it('returns false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await checkSession()
    expect(result).toBe(false)
  })
})

describe('login', () => {
  it('returns ok:true on successful login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ requiresPasswordReset: false }),
    } as Response)
    const result = await login('password123')
    expect(result.ok).toBe(true)
  })

  it('returns ok:false with error on failed login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid password' }),
    } as Response)
    const result = await login('wrongpassword')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Invalid password')
  })
})

describe('getApiBase', () => {
  it('returns the current API base URL', () => {
    const base = getApiBase()
    expect(typeof base).toBe('string')
  })
})

describe('fetchExtensionStatus', () => {
  it('returns unavailable on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    const result = await fetchExtensionStatus()
    expect(result).toEqual({ available: false, connected: false })
  })

  it('returns extension status on ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ available: true, connected: true }),
    } as Response)
    const result = await fetchExtensionStatus()
    expect(result).toEqual({ available: true, connected: true })
  })
})

describe('runSandbox', () => {
  it('returns success result on ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, output: 'hello' }),
    } as Response)
    const result = await runSandbox('console.log("hello")')
    expect(result.success).toBe(true)
    expect(result.output).toBe('hello')
    expect(result.isError).toBe(false)
  })

  it('returns error result on fetch exception', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'))
    const result = await runSandbox('bad code')
    expect(result.success).toBe(false)
    expect(result.isError).toBe(true)
  })
})
