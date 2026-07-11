import fs from 'fs';

const bridgePath = 'src/core/ssss-kernel-bridge.mjs';
let content = fs.readFileSync(bridgePath, 'utf8');

const target = `  if (prepared.warnings.length && response?.validation) {
    response.validation.warnings = [
      ...(response.validation.warnings || []),
      ...prepared.warnings,
    ];
  }
  return response;
}`;

const replacement = `  if (prepared.warnings.length && response?.validation) {
    response.validation.warnings = [
      ...(response.validation.warnings || []),
      ...prepared.warnings,
    ];
  }

  // Handle successful commit TR-specific audit log
  if (response.success && !env.dry_run) {
    if (response.type !== 'event') {
      const eventsDir = path.join(vaultRoot, '.events');
      if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
      const auditLog = {
        id: crypto.randomUUID(),
        event_type: 'audit',
        timestamp: new Date().toISOString(),
        operation_id: response.operation_id,
        path: response.path,
        actor: env.actor?.role || 'system',
      };
      fs.appendFileSync(path.join(eventsDir, 'audit.jsonl'), JSON.stringify(auditLog) + '\\n');
    }
  }

  return response;
}`;

content = content.replace(target, replacement);
fs.writeFileSync(bridgePath, content);
