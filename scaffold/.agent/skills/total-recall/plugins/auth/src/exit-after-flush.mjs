/**
 * Exit once everything already written to stdout and stderr has left the process.
 *
 * process.exit() drops whatever is still queued. On macOS a pipe write is
 * asynchronous and the pipe takes 64 KiB at once, so a report followed by
 * process.exit(1) reaches its reader cut off. The host reads this CLI through a pipe.
 *
 * The returned promise never settles, so `await exitAfterFlush(code)` stops the
 * caller the way process.exit() does. A reader that has gone away is not an error.
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
