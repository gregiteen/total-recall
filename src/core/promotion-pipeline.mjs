/**
 * Promotes a feedback-derived memory node to a wider scope after applying
 * strict provenance stripping and privacy guarantees.
 * 
 * Flow: workspace -> system_candidate -> system_promoted
 * 
 * @param {object} memoryNode - The memory node data (frontmatter + __body__).
 * @param {string} targetScope - 'system_candidate' or 'system_promoted'
 * @returns {object} { success: boolean, node: object, errors: string[] }
 */
export function promoteFeedback(memoryNode, targetScope) {
  const currentScope = memoryNode.feedback_scope || 'workspace';
  
  if (targetScope === 'system_candidate') {
    if (currentScope !== 'workspace' && currentScope !== 'local_thread') {
      return { success: false, node: null, errors: [`Cannot promote to system_candidate from ${currentScope}`] };
    }
    
    // Provenance stripping
    const strippedNode = JSON.parse(JSON.stringify(memoryNode));
    strippedNode.feedback_scope = 'system_candidate';
    
    // Remove PII / workspace leaking fields
    delete strippedNode.workspace_id;
    delete strippedNode.user_id;
    if (strippedNode.source) {
      delete strippedNode.source.session_id;
      delete strippedNode.source.agent;
    }
    delete strippedNode.x_browser_context;
    delete strippedNode.x_location;
    delete strippedNode.x_citations; // Citations might contain private workspace doc links
    
    // Scrub body for UUIDs
    if (strippedNode.__body__) {
      strippedNode.__body__ = strippedNode.__body__.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '[REDACTED_UUID]');
    }

    return { success: true, node: strippedNode, errors: [] };
  }
  
  if (targetScope === 'system_promoted') {
    if (currentScope !== 'system_candidate') {
      return { success: false, node: null, errors: [`Cannot promote to system_promoted directly from ${currentScope}. Must be system_candidate first.`] };
    }
    
    const promotedNode = JSON.parse(JSON.stringify(memoryNode));
    promotedNode.feedback_scope = 'system_promoted';
    
    return { success: true, node: promotedNode, errors: [] };
  }
  
  return { success: false, node: null, errors: [`Unknown target scope: ${targetScope}`] };
}
