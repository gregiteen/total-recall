import { useCallback, useEffect, useState } from 'react'
import { useRunner, type RunResult } from './runner-context'

/** Runs a read command now and on an interval. Cards observe; they never mutate. */
export function useSource(command: string | undefined, args: string[] = [], refreshSeconds = 0) {
  const { run, busy } = useRunner()
  const [result, setResult] = useState<RunResult | null>(null)
  const key = JSON.stringify(args)
  const load = useCallback(async () => {
    if (!command) return
    setResult(await run(command, {}, JSON.parse(key)))
  }, [command, key, run])
  useEffect(() => {
    if (!command) return
    let live = true
    const poll = () => { run(command, {}, JSON.parse(key)).then(next => { if (live) setResult(next) }) }
    poll()
    const timer = refreshSeconds ? setInterval(poll, refreshSeconds * 1000) : undefined
    return () => { live = false; if (timer) clearInterval(timer) }
  }, [command, key, refreshSeconds, run])
  return { result, loading: !!command && busy.has(command), reload: load }
}
