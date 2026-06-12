import { SSSS_SCHEMAS } from './schema.mjs';

/**
 * Validates a memory node against the SSSS standard, enforcing
 * Schema V2 conditional requirements for Total Recall.
 * 
 * @param {object} fmData - The parsed YAML frontmatter of the memory node.
 * @returns {object} { success: boolean, errors: string[] }
 */
export function validateMemoryNode(fmData) {
  const errors = [];
  
  // 1. Base schema validation (types, bounds, basic required fields)
  const r = SSSS_SCHEMAS['memory'].safeParse(fmData);
  if (!r.success) {
    r.error.issues.forEach(i => errors.push(`${i.path.join('.')}: ${i.message}`));
  }

  // 2. Schema V2 Conditional Validation
  // If schema_version === 2, the following fields are strictly required:
  if (fmData.schema_version === 2) {
    const v2Required = [
      'confidence',
      'importance',
      'modality',
      'subject',
      'predicate',
      'object',
      'sentiment_polarity',
      'sentiment_target'
    ];

    v2Required.forEach(field => {
      if (fmData[field] === undefined || fmData[field] === null) {
        errors.push(`V2 Schema Requirement: Missing required field '${field}'`);
      }
    });
  }

  return {
    success: errors.length === 0,
    errors
  };
}
