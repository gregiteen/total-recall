export function beforeNotifyHook(context) {
  // A simple interceptor that could format messages or add global prefixes
  if (context && context.message) {
    context.message = `[System] ${context.message}`;
  }
  return context;
}
