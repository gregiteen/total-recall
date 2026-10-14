import { createContext, useContext } from 'react'
import type { ArgValues } from './args'
import type { Card, Loose } from './contract'
import type { PluginExecution } from '../../../api/plugins'

export interface RunResult { ok: boolean; data?: Loose; text: string; error?: string; ms: number }
export interface ActivityEntry { at: string; command: string; effect: string; ok: boolean; ms: number }
export interface Runner { card: Card; run: (command: string, values?: ArgValues, extra?: string[], stdin?: string) => Promise<RunResult>; activity: ActivityEntry[]; busy: Set<string>; execution: PluginExecution | null; setExecution: (value: PluginExecution | null) => void }

export const RunnerContext = createContext<Runner | null>(null)
export const useRunner = () => { const value = useContext(RunnerContext); if (!value) throw new Error('Card widgets must render inside a CardRunner'); return value }
