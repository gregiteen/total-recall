/**
 * Exit once everything already written to stdout and stderr has left the process.
 *
 * process.exit() drops whatever is still queued. On macOS a pipe write is
 * asynchronous and the pipe takes 64 KiB at once, so `write(big); process.exit()`
 * loses the rest with exit status 0, while a redirect to a file looks fine.
 *
 * The returned promise never settles, so `await exitAfterFlush(code)` stops the
 * caller the way process.exit() does. A reader that has gone away (`| head`) is
 * not an error here: the unwritten output has nowhere to go.
 */
function drained(stream) {
  return new Promise((resolve) => {
    stream.on('error', resolve);
    if (stream.destroyed || !stream.writable || stream.writableLength === 0) return resolve();
    stream.write('', resolve);
  });
}

export function exitAfterFlush(code = process.exitCode ?? 0) {
  Promise.all([drained(process.stdout), drained(process.stderr)]).then(() => process.exit(code));
  return new Promise(() => {});
}
