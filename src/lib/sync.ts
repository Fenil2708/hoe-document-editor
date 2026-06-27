export interface BlockState {
  id: string;
  documentId: string;
  type: string;
  content: string;
  position: string;
  updatedAt: string; // ISO Date String
  updatedBy: string;
  isDeleted: boolean;
}

export interface SyncPayload {
  documentId: string;
  clientId: string;
  mutations: BlockState[];
  lastSyncedAt: string | null; // ISO Date String
}

export interface SyncResponse {
  success: boolean;
  serverBlocks: BlockState[];
  syncTime: string;
}

/**
 * Deterministic merge algorithm for document blocks using Last-Write-Wins (LWW).
 * If timestamps are equal, we break the tie using a lexicographical comparison of the userId.
 */
export function mergeBlocks(localBlocks: BlockState[], remoteBlocks: BlockState[]): BlockState[] {
  const blockMap = new Map<string, BlockState>();

  // Add all local blocks
  for (const block of localBlocks) {
    blockMap.set(block.id, block);
  }

  // Merge remote blocks
  for (const remote of remoteBlocks) {
    const local = blockMap.get(remote.id);
    if (!local) {
      blockMap.set(remote.id, remote);
    } else {
      const localTime = new Date(local.updatedAt).getTime();
      const remoteTime = new Date(remote.updatedAt).getTime();

      if (remoteTime > localTime) {
        blockMap.set(remote.id, remote);
      } else if (remoteTime === localTime) {
        // Tie breaker: lexicographically higher user ID wins
        if (remote.updatedBy > local.updatedBy) {
          blockMap.set(remote.id, remote);
        }
      }
    }
  }

  return Array.from(blockMap.values());
}

/**
 * Simple fractional indexing helper to generate a lexicographical position string
 * between two existing positions a and b.
 * a < result < b
 */
export function generatePositionBetween(a: string | null, b: string | null): string {
  const first = a || 'a';
  const last = b || 'z';

  if (!a && !b) return 'm';

  if (!a) {
    // Insert before b
    const firstChar = first.charCodeAt(0);
    const lastChar = last.charCodeAt(0);
    if (lastChar > firstChar) {
      const mid = Math.floor((firstChar + lastChar) / 2);
      return String.fromCharCode(mid);
    }
    return first + 'm';
  }

  if (!b) {
    // Insert after a
    const firstChar = first.charCodeAt(first.length - 1);
    const zChar = 'z'.charCodeAt(0);
    if (zChar > firstChar) {
      const mid = Math.floor((firstChar + zChar) / 2);
      return first.slice(0, -1) + String.fromCharCode(mid);
    }
    return first + 'm';
  }

  // Insert between a and b
  let commonLength = 0;
  const minLen = Math.min(first.length, last.length);
  while (commonLength < minLen && first[commonLength] === last[commonLength]) {
    commonLength++;
  }

  const commonPrefix = first.slice(0, commonLength);
  const charA = commonLength < first.length ? first.charCodeAt(commonLength) : 'a'.charCodeAt(0) - 1;
  const charB = commonLength < last.length ? last.charCodeAt(commonLength) : 'z'.charCodeAt(0) + 1;

  if (charB - charA > 1) {
    const mid = Math.floor((charA + charB) / 2);
    return commonPrefix + String.fromCharCode(mid);
  }

  return first + 'm';
}
