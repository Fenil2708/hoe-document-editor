import { mergeBlocks, generatePositionBetween, BlockState } from '../src/lib/sync';

function runTests() {
  console.log('--- STARTING SYNC ENGINE TEST SUITE ---');

  let passed = true;

  // Helper to log test status
  const test = (name: string, fn: () => void) => {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      passed = false;
    }
  };

  // Mock blocks helper
  const createMockBlock = (id: string, content: string, timeStr: string, user: string, pos: string = 'm', isDeleted = false): BlockState => ({
    id,
    documentId: 'demo-doc',
    type: 'text',
    content,
    position: pos,
    updatedAt: new Date(timeStr).toISOString(),
    updatedBy: user,
    isDeleted,
  });

  // 1. Merge Tests
  test('LWW: newer block update overrides older block', () => {
    const local = [createMockBlock('block-1', 'Local Draft Content', '2026-06-27T04:00:00Z', 'user-editor')];
    const remote = [createMockBlock('block-1', 'Remote Fresh Content', '2026-06-27T04:05:00Z', 'user-owner')];

    const merged = mergeBlocks(local, remote);
    if (merged.length !== 1 || merged[0].content !== 'Remote Fresh Content') {
      throw new Error(`Expected content "Remote Fresh Content" but got "${merged[0]?.content}"`);
    }
  });

  test('LWW: older block update does not override newer block', () => {
    const local = [createMockBlock('block-1', 'Local Fresh Content', '2026-06-27T04:10:00Z', 'user-editor')];
    const remote = [createMockBlock('block-1', 'Remote Stale Content', '2026-06-27T04:05:00Z', 'user-owner')];

    const merged = mergeBlocks(local, remote);
    if (merged.length !== 1 || merged[0].content !== 'Local Fresh Content') {
      throw new Error(`Expected content "Local Fresh Content" but got "${merged[0]?.content}"`);
    }
  });

  test('LWW: tie-breaker resolves lexicographically on userId if timestamps match', () => {
    const local = [createMockBlock('block-1', 'Editor text wins', '2026-06-27T04:00:00Z', 'user-editor')];
    const remote = [createMockBlock('block-1', 'Owner text loses', '2026-06-27T04:00:00Z', 'user-owner')]; // 'user-owner' > 'user-editor' alphabetically

    const merged = mergeBlocks(local, remote);
    if (merged.length !== 1 || merged[0].content !== 'Owner text loses') {
      throw new Error(`Expected content "Owner text loses" (owner > editor) but got "${merged[0]?.content}"`);
    }
  });

  test('LWW: preserves deleted block tombstones correctly', () => {
    const local = [createMockBlock('block-1', 'Active Text', '2026-06-27T04:00:00Z', 'user-editor')];
    const remote = [createMockBlock('block-1', 'Deleted Text', '2026-06-27T04:05:00Z', 'user-owner', 'm', true)];

    const merged = mergeBlocks(local, remote);
    if (merged.length !== 1 || !merged[0].isDeleted) {
      throw new Error(`Expected block to be marked isDeleted: true`);
    }
  });

  // 2. Fractional Indexing Tests
  test('Fractional Indexing: generates midpoint between nulls', () => {
    const pos = generatePositionBetween(null, null);
    if (pos !== 'm') {
      throw new Error(`Expected midpoint 'm' but got '${pos}'`);
    }
  });

  test('Fractional Indexing: generates correct smaller index before midpoint', () => {
    const pos = generatePositionBetween(null, 'm');
    if (pos.localeCompare('m') >= 0) {
      throw new Error(`Expected position to be smaller than 'm' but got '${pos}'`);
    }
  });

  test('Fractional Indexing: generates correct larger index after midpoint', () => {
    const pos = generatePositionBetween('m', null);
    if (pos.localeCompare('m') <= 0) {
      throw new Error(`Expected position to be larger than 'm' but got '${pos}'`);
    }
  });

  test('Fractional Indexing: generates midpoint string between adjacent keys', () => {
    const pos = generatePositionBetween('m', 'n');
    if (pos.localeCompare('m') <= 0 || pos.localeCompare('n') >= 0) {
      throw new Error(`Expected 'm' < '${pos}' < 'n'`);
    }
  });

  console.log('\n--- TEST SUITE COMPLETE ---');
  if (passed) {
    console.log('✅ ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runTests();
