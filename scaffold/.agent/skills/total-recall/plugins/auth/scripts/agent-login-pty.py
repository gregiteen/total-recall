#!/usr/bin/env python3
"""Sign in an agent CLI that authenticates on its own terminal.

Some agent CLIs (Antigravity / `agy`) print an OAuth consent URL, then block reading the
authorization code from their terminal. Driving that needs a pty, and Node has none built in and no
pty library in this plugin, so the pty lives here — as part of the plugin, not as a script beside it.

The code arrives through a file this process watches. That is a constraint, not a preference:
`legacy_tiocsti` is 0 on current kernels, so no outside process can type into another process's pty,
and a backgrounded command has no attachable stdin. `--code` and `--code-file` both funnel into the
same pty write.

Prints newline-delimited JSON events on stdout so the caller can relay progress, and exits 0 only
when the CLI's own login probe says the session exists.
"""
import argparse
import json
import os
import pty
import re
import select
import subprocess
import sys
import time

ANSI = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')


def emit(event, **fields):
    payload = {'event': event}
    payload.update(fields)
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def resolve_binary(name):
    for candidate in (
        os.path.join(os.path.expanduser('~'), '.local', 'bin', name),
        os.path.join('/usr/local/bin', name),
        os.path.join('/usr/bin', name),
    ):
        if os.path.exists(candidate):
            return candidate
    return name


def probe(binary, args, signed_out_pattern):
    """Ask the CLI itself whether a session exists. The transcript is not evidence."""
    try:
        result = subprocess.run([binary] + args, capture_output=True, text=True, timeout=60)
        output = (result.stdout or '') + (result.stderr or '')
        signed_out = bool(re.search(signed_out_pattern, output, re.I))
        return {
            'signed_in': (not signed_out) and result.returncode == 0,
            'status': result.returncode,
            'output': output.strip()[:400],
        }
    except Exception as error:  # noqa: BLE001 - report, never raise
        return {'signed_in': False, 'status': None, 'output': str(error)[:400]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--agent', required=True)
    parser.add_argument('--binary', required=True)
    parser.add_argument('--code', default='')
    parser.add_argument('--code-file', default='')
    parser.add_argument('--url-file', default='')
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('--probe-args', default='models')
    parser.add_argument('--signed-out-pattern', default=r'please sign in')
    parser.add_argument('--consent-host', default='accounts.google.com')
    args = parser.parse_args()

    binary = resolve_binary(args.binary)

    before = probe(binary, args.probe_args.split(), args.signed_out_pattern)
    if before['signed_in']:
        emit('already_signed_in', probe=before)
        emit('done', ok=True)
        return 0

    pid, fd = pty.fork()
    if pid == 0:
        os.environ['PATH'] = os.path.dirname(binary) + os.pathsep + os.environ.get('PATH', '')
        os.execv(binary, [args.binary])

    time.sleep(2)
    os.write(fd, b'\r')

    published_url = ''
    delivered_code = args.code.strip()
    buffer = b''
    deadline = time.time() + args.timeout
    next_probe_at = time.time()
    success = False

    while time.time() < deadline:
        try:
            ready, _, _ = select.select([fd], [], [], 1.0)
            if ready:
                chunk = os.read(fd, 8192)
                if not chunk:
                    break
                buffer += chunk
                text = ANSI.sub('', buffer.decode('utf-8', errors='ignore'))

                if not published_url:
                    parts, collecting = [], False
                    for line in text.splitlines():
                        line = line.strip()
                        if args.consent_host in line:
                            collecting = True
                        if collecting:
                            parts.append(line)
                            if 'state=' in line:
                                break
                    candidate = ''.join(parts).replace(' ', '')
                    if candidate:
                        published_url = candidate
                        if args.url_file:
                            with open(args.url_file, 'w') as handle:
                                handle.write(candidate + '\n')
                        emit('url', url=candidate)
        except Exception:
            break

        # Deliver the code once the URL is out, from the argument or from the watched file.
        if published_url and not delivered_code:
            if args.code_file and os.path.exists(args.code_file):
                try:
                    candidate = open(args.code_file).read().strip()
                except Exception:
                    candidate = ''
                if candidate:
                    delivered_code = candidate
                    os.write(fd, candidate.encode() + b'\r')
                    emit('code_delivered', length=len(candidate))
            elif args.code:
                delivered_code = args.code.strip()
                os.write(fd, delivered_code.encode() + b'\r')
                emit('code_delivered', length=len(delivered_code))

        # Two ways to know it is done. The CLI's success line is one, but not every CLI prints a
        # string we can rely on — Antigravity completed the sign-in without ever emitting the
        # literal line. The authoritative signal is the CLI's own probe, so poll it too; otherwise
        # this waits out the full timeout on a sign-in that already succeeded.
        if published_url:
            if re.search(r'authentication successful', ANSI.sub('', buffer.decode('utf-8', errors='ignore')), re.I):
                success = True
                break
            if delivered_code:
                if time.time() >= next_probe_at:
                    if probe(binary, args.probe_args.split(), args.signed_out_pattern)['signed_in']:
                        success = True
                        break
                    next_probe_at = time.time() + 5

    if success:
        after = probe(binary, args.probe_args.split(), args.signed_out_pattern)
        emit('probe', probe=after)
        ok = bool(after['signed_in'])
        emit('done', ok=ok)
        try:
            os.write(fd, b'\x03')
        except Exception:
            pass
        return 0 if ok else 2

    emit('done', ok=False, reason='timed out waiting for the sign-in to complete')
    # Restore the tty before exiting. Leaving it to the runtime produced
    # 'tcsetattr: Inappropriate ioctl for device' on the way out.
    try:
        os.write(fd, b'\x03')
    except Exception:
        pass
    try:
        os.close(fd)
    except Exception:
        pass
    return 2


if __name__ == '__main__':
    sys.exit(main())
