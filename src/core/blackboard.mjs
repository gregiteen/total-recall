import fs from 'fs';
import path from 'path';
import { atomicWrite } from './vault.mjs';
import { logger } from './logger.mjs';

/**
 * Blackboard State Tracker
 * Allows autonomous subagents to persist intermediate JSON state during long-running workflows.
 * Used for resuming after crashes or API timeouts.
 */

export function loadBlackboard(boardId, blackboardDir) {
  const filePath = path.join(blackboardDir, `${boardId}.json`);
  if (!fs.existsSync(filePath)) {
    return { id: boardId, state: {}, step: 0, history: [] };
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    logger.warn('blackboard', `Failed to parse ${boardId}`, { err: err.message });
    return { id: boardId, state: {}, step: 0, history: [] };
  }
}

export function saveBlackboard(board, blackboardDir) {
  if (!fs.existsSync(blackboardDir)) {
    fs.mkdirSync(blackboardDir, { recursive: true });
  }
  
  const filePath = path.join(blackboardDir, `${board.id}.json`);
  atomicWrite(filePath, JSON.stringify(board, null, 2));
}

export function updateBlackboardState(boardId, blackboardDir, updates) {
  const board = loadBlackboard(boardId, blackboardDir);
  
  board.state = { ...board.state, ...updates };
  board.step += 1;
  board.history.push({
    ts: new Date().toISOString(),
    updates: Object.keys(updates)
  });
  
  saveBlackboard(board, blackboardDir);
  return board;
}

export function clearBlackboard(boardId, blackboardDir) {
  const filePath = path.join(blackboardDir, `${boardId}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
