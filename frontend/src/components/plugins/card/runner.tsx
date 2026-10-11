import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { runPluginCommand } from '../../../api/plugins'
import { buildArgs, type ArgValues } from './args'
import type { Card, Loose } from './contract'
import { RunnerContext, type ActivityEntry, type RunResult } from './runner-context'

/**
 * The only path from a card to a plugin. A card configures and observes; agents do the
 * work through the CLI. So only declared read commands run here, and the activity
 * entries record command, outcome and duration, never arguments or output.
 */
export function CardRunner({ card, children }: { card: Card; children: ReactNode }) {
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const cardRef = useRef(card)
  useEffect(() => { cardRef.current = card }, [card])
  const run = useCallback(async (name: string, values: ArgValues = {}, extra: string[] = []): Promise<RunResult> => {
    const command = cardRef.current.commands.get(name)
    if (!command) return { ok: false, text: '', error: `${name} is not a declared command`, ms: 0 }
    if (command.effect !== 'read') return { ok: false, text: '', error: 'Cards only run read commands. An agent runs this one through the CLI.', ms: 0 }
    const started = performance.now()
    setBusy(previous => new Set(previous).add(name))
    let result: RunResult
    try {
      const response = await runPluginCommand(cardRef.current.id, name, buildArgs(command, values, extra))
      const text = response.output || ''
      let data: Loose
      if (command.output === 'json' && text.trim()) { try { data = JSON.parse(text) } catch { /* shown as text */ } }
      result = { ok: !!response.success, data, text, error: response.success ? undefined : response.timedOut ? 'The command timed out' : response.error || 'The command failed', ms: Math.round(performance.now() - started) }
    } catch (err: unknown) {
      result = { ok: false, text: '', error: err instanceof Error ? err.message : 'The command failed', ms: Math.round(performance.now() - started) }
    }
    setBusy(previous => { const next = new Set(previous); next.delete(name); return next })
    setActivity(previous => [{ at: new Date().toISOString(), command: name, effect: command.effect, ok: result.ok, ms: result.ms }, ...previous].slice(0, 100))
    return result
  }, [])
  const value = useMemo(() => ({ card, run, activity, busy }), [card, run, activity, busy])
  return <RunnerContext.Provider value={value}>{children}</RunnerContext.Provider>
}
