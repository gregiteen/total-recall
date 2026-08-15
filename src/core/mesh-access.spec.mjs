import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SSH_PORT,
  TAILSCALE_VARIANTS,
  accessFromSshConfigEntry,
  buildSshArgs,
  classifyTailscaleVariant,
  findSshConfigEntryForNode,
  formatAccessTarget,
  meshSshFromVariant,
  parseSshConfig,
  proposeAccessFromSshConfig,
  resolveNodeAccess,
  sshConfigMatchScore,
} from './mesh-access.mjs';

const SSH_CONFIG = `
# a comment
Host mac-mini
  HostName 10.0.0.132
  User gregoryiteen
  IdentityFile ~/.ssh/id_ed25519
  ForwardAgent yes

Host build-box
  HostName 100.64.0.9
  User ci
  Port 2222

Host *
  ServerAliveInterval 60
  User nobody
`;

describe('parseSshConfig', () => {
  it('parses the connection-relevant directives of each block', () => {
    const entries = parseSshConfig(SSH_CONFIG);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      patterns: ['mac-mini'],
      hostname: '10.0.0.132',
      user: 'gregoryiteen',
      identityFile: '~/.ssh/id_ed25519',
    });
    expect(entries[1]).toMatchObject({ user: 'ci', port: 2222 });
  });

  it('accepts `=` separators and mixed case, as ssh(1) does', () => {
    const entries = parseSshConfig('HOST weird\n  HostName=example.internal\n  USER=root\n');
    expect(entries[0]).toMatchObject({ hostname: 'example.internal', user: 'root' });
  });

  it('ignores comments and blank lines without inventing blocks', () => {
    expect(parseSshConfig('\n# nothing here\n\n')).toEqual([]);
  });

  it('drops directives that appear before any Host block', () => {
    const entries = parseSshConfig('User orphan\nHost real\n  User realuser\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].user).toBe('realuser');
  });
});

describe('sshConfigMatchScore', () => {
  const entries = parseSshConfig(SSH_CONFIG);

  // The real failure: the config block is named `mac-mini`, the mesh calls the
  // node `macmini`, and a literal comparison finds nothing.
  it('matches a nickname that differs only in punctuation', () => {
    const node = { hostname: 'macmini', ip: '100.64.0.2' };
    expect(findSshConfigEntryForNode(entries, node)?.user).toBe('gregoryiteen');
  });

  // The shape discovery actually returns: the control server hands back a
  // fully-qualified name, while the operator's config is keyed on the short
  // one. Comparing whole strings matches nothing.
  it('matches a short config nickname against a fully-qualified mesh hostname', () => {
    const node = { hostname: 'macmini.mesh.example.org', ip: '100.64.0.2' };
    expect(findSshConfigEntryForNode(entries, node)?.user).toBe('gregoryiteen');
  });

  it('matches on LAN address even when the nickname is unrelated', () => {
    const node = { hostname: 'totally-different', lan_ip: '10.0.0.132' };
    expect(findSshConfigEntryForNode(entries, node)?.user).toBe('gregoryiteen');
  });

  it('ranks an address match above a name match', () => {
    const byAddress = { hostname: 'nope', ip: '10.0.0.132' };
    const byName = { hostname: 'mac-mini' };
    expect(sshConfigMatchScore(entries[0], byAddress)).toBeGreaterThan(
      sshConfigMatchScore(entries[0], byName),
    );
  });

  // `Host *` carries a User for every host on earth; attaching it to a node
  // would bake a wrong login into the vault and look authoritative.
  it('never matches a wildcard block', () => {
    const node = { hostname: 'anything', ip: '100.64.0.77' };
    expect(findSshConfigEntryForNode(entries, node)).toBeNull();
  });

  it('returns no match for a node it knows nothing about', () => {
    expect(sshConfigMatchScore(entries[0], { hostname: 'unrelated' })).toBe(0);
  });
});

describe('accessFromSshConfigEntry', () => {
  it('imports the login account, port and key path', () => {
    const [entry] = parseSshConfig(SSH_CONFIG);
    expect(accessFromSshConfigEntry(entry)).toMatchObject({
      ssh_user: 'gregoryiteen',
      identity_file: '~/.ssh/id_ed25519',
      source: 'ssh_config',
    });
  });

  // An ssh config HostName is a LAN address or a local nickname — right only
  // on the machine that wrote it. The mesh address works from every node, so
  // importing the local one would replace a portable answer with a fragile one.
  it('never imports the config HostName as the address', () => {
    const [entry] = parseSshConfig(SSH_CONFIG);
    expect(accessFromSshConfigEntry(entry).ssh_host).toBeUndefined();
  });

  it('leaves the mesh address in charge when access came from ssh config', () => {
    const [entry] = parseSshConfig(SSH_CONFIG);
    const node = { hostname: 'macmini.mesh.example.org', ip: '100.64.0.2' };
    expect(resolveNodeAccess({ ...node, access: accessFromSshConfigEntry(entry) }).host)
      .toBe('100.64.0.2');
  });
});

describe('classifyTailscaleVariant', () => {
  it('treats a tailscaled binary as the open-source build', () => {
    expect(classifyTailscaleVariant({ platform: 'darwin', hasClient: true, hasDaemon: true }))
      .toBe(TAILSCALE_VARIANTS.DAEMON);
  });

  it('treats macOS with a client but no daemon as a sandboxed GUI build', () => {
    expect(classifyTailscaleVariant({ platform: 'darwin', hasClient: true }))
      .toBe(TAILSCALE_VARIANTS.SANDBOXED);
  });

  // Linux ships client and daemon in one package, so the daemon is present even
  // when it is not at one of the paths we probe.
  it('treats a Linux client as daemon-capable', () => {
    expect(classifyTailscaleVariant({ platform: 'linux', hasClient: true }))
      .toBe(TAILSCALE_VARIANTS.DAEMON);
  });

  it('reports a missing client', () => {
    expect(classifyTailscaleVariant({ platform: 'linux' })).toBe(TAILSCALE_VARIANTS.MISSING);
  });

  it('maps variants to mesh SSH capability', () => {
    expect(meshSshFromVariant(TAILSCALE_VARIANTS.DAEMON)).toBe('available');
    expect(meshSshFromVariant(TAILSCALE_VARIANTS.SANDBOXED)).toBe('unsupported');
    expect(meshSshFromVariant(TAILSCALE_VARIANTS.UNKNOWN)).toBe('unknown');
  });
});

describe('resolveNodeAccess', () => {
  it('builds a complete target from entity access', () => {
    const resolved = resolveNodeAccess({
      hostname: 'macmini',
      ip: '100.64.0.2',
      access: { ssh_user: 'gregoryiteen' },
    });
    expect(resolved).toMatchObject({ user: 'gregoryiteen', host: '100.64.0.2', complete: true });
    expect(resolved.target).toBe('gregoryiteen@100.64.0.2');
  });

  // The mesh address is reachable from anywhere; a LAN address only works when
  // both ends happen to share a network.
  it('prefers the mesh address over the LAN address', () => {
    const resolved = resolveNodeAccess({
      ip: '100.64.0.2',
      lan_ip: '10.0.0.132',
      access: { ssh_user: 'me' },
    });
    expect(resolved.host).toBe('100.64.0.2');
  });

  it('lets an explicit ssh_host override discovery', () => {
    const resolved = resolveNodeAccess({
      ip: '100.64.0.2',
      access: { ssh_user: 'me', ssh_host: 'jump.example.org' },
    });
    expect(resolved.host).toBe('jump.example.org');
  });

  it('marks a node with no known user as incomplete', () => {
    const resolved = resolveNodeAccess({ hostname: 'macmini', ip: '100.64.0.2' });
    expect(resolved.complete).toBe(false);
    expect(resolved.target).toBeNull();
    expect(formatAccessTarget(resolved)).toBe('(unknown user)@100.64.0.2');
  });

  it('defaults the port and reports a custom one', () => {
    expect(resolveNodeAccess({ ip: '1.2.3.4', access: { ssh_user: 'a' } }).port)
      .toBe(DEFAULT_SSH_PORT);
    const custom = resolveNodeAccess({ ip: '1.2.3.4', access: { ssh_user: 'a', ssh_port: 2222 } });
    expect(formatAccessTarget(custom)).toBe('a@1.2.3.4:2222');
  });
});

describe('buildSshArgs', () => {
  it('refuses to build a command for incomplete access', () => {
    expect(buildSshArgs(resolveNodeAccess({ ip: '1.2.3.4' }))).toBeNull();
  });

  it('emits a plain target when nothing special is configured', () => {
    const resolved = resolveNodeAccess({ ip: '100.64.0.2', access: { ssh_user: 'me' } });
    expect(buildSshArgs(resolved)).toEqual(['me@100.64.0.2']);
  });

  // A crowded or wedged agent can offer the wrong key first and get refused
  // before the right one is ever tried — the failure this whole module traces
  // back to — so a configured key is pinned.
  it('pins a configured identity so the agent cannot preempt it', () => {
    const resolved = resolveNodeAccess({
      ip: '100.64.0.2',
      access: { ssh_user: 'me', identity_file: '~/.ssh/id_ed25519', ssh_port: 2222 },
    });
    expect(buildSshArgs(resolved, { command: 'hostname' })).toEqual([
      '-p', '2222',
      '-i', '~/.ssh/id_ed25519',
      '-o', 'IdentitiesOnly=yes',
      'me@100.64.0.2',
      'hostname',
    ]);
  });
});

describe('proposeAccessFromSshConfig', () => {
  it('proposes a user for a node that has none', () => {
    const proposals = proposeAccessFromSshConfig(
      [{ hostname: 'macmini', ip: '100.64.0.2', lan_ip: '10.0.0.132' }],
      SSH_CONFIG,
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].access.ssh_user).toBe('gregoryiteen');
  });

  it('leaves a node that already has a user alone', () => {
    const proposals = proposeAccessFromSshConfig(
      [{ hostname: 'macmini', lan_ip: '10.0.0.132', access: { ssh_user: 'already-set' } }],
      SSH_CONFIG,
    );
    expect(proposals).toEqual([]);
  });

  it('proposes nothing when the config has no matching block', () => {
    expect(proposeAccessFromSshConfig([{ hostname: 'stranger' }], SSH_CONFIG)).toEqual([]);
  });
});
