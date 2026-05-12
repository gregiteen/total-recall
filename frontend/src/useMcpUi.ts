import { useEffect, useState, useCallback } from 'react';

/**
 * Hook to manage MCP UI Protocol via postMessage.
 * Allows the SPA to render natively within Claude Desktop or Cursor's ui:// schema.
 */
export function useMcpUi() {
  const [mcpContext, setMcpContext] = useState<Record<string, unknown> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // MCP UI Protocol uses specific message shapes
      const { type, payload } = event.data;

      if (type === 'mcp:init') {
        setMcpContext(payload);
        setIsConnected(true);
        
        // Acknowledge initialization
        window.parent.postMessage({ type: 'mcp:init_ack' }, '*');
      } else if (type === 'mcp:update') {
        setMcpContext((prev: Record<string, unknown> | null) => ({ ...(prev || {}), ...payload }));
      }
    };

    window.addEventListener('message', handleMessage);

    // Notify host that we are ready to receive initialization
    window.parent.postMessage({ type: 'mcp:ready' }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const sendAction = useCallback((actionType: string, data: Record<string, unknown>) => {
    if (!isConnected) return;
    
    window.parent.postMessage({
      type: 'mcp:action',
      payload: {
        action: actionType,
        ...data
      }
    }, '*');
  }, [isConnected]);

  return { mcpContext, isConnected, sendAction };
}
