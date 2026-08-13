import { get, post } from './_base'

/** One model on the Ollama host, annotated with why it can or cannot be used. */
export interface EmbeddingCandidate {
  name: string
  size: number | null
  family: string | null
  capabilities: string[]
  /** Whether the model declares the embedding capability at all. */
  embedding: boolean
  /** Vector width the model produces, or null when it is not an embedding model. */
  dims: number | null
  /** True only when it embeds AND its width matches the vault index. */
  compatible: boolean
}

export interface LocalEmbeddingProvider {
  available: boolean
  endpoint: string | null
  selected: string | null
  preferred: string | null
  dims: number
  candidates: EmbeddingCandidate[]
  reason: string | null
}

export interface EmbeddingProviderStatus {
  dims: number
  local: LocalEmbeddingProvider
  fallbacks: { provider: string; configured: boolean }[]
}

export async function fetchEmbeddingProvider(): Promise<EmbeddingProviderStatus> {
  return get<EmbeddingProviderStatus>('/api/embeddings/provider')
}

/** Pin a model, or pass null to return to automatic selection. */
export async function setEmbeddingModel(
  model: string | null,
): Promise<{ ok: boolean; pinned: string | null; selected: string | null }> {
  return post('/api/embeddings/model', { model })
}

export async function rediscoverEmbeddingProvider(): Promise<{ ok: boolean; local: LocalEmbeddingProvider }> {
  return post('/api/embeddings/rediscover', {})
}
