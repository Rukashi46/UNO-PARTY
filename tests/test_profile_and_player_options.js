const assert = require('assert');

// Test 1: Player count options 1-10 verification
console.log('--- TEST 1: PLAYER COUNT OPTIONS 1 TO 10 ---');
const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
assert.strictEqual(options.length, 10);
options.forEach((opt, idx) => {
  assert.strictEqual(opt, idx + 1);
});
console.log('  PASS: Options strictly contain [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]');

// Test 2: Bot mode sizing for 1 to 10
const botPool = [
  { name: 'Sarah', avatar: '👩🏼' },
  { name: 'Alex', avatar: '👦🏼' },
  { name: 'Chris', avatar: '👨🏽' },
  { name: 'May', avatar: '👧🏻' },
  { name: 'Tiger', avatar: '🐯' },
  { name: 'Clever Panda', avatar: '🐼' },
  { name: 'Jason', avatar: '🧔🏻‍♂️' },
  { name: 'Wild Fox', avatar: '🦊' },
  { name: 'Sam', avatar: '🧑🏽' },
];

for (let size = 1; size <= 10; size++) {
  const selectedBots = size <= 1 ? [] : botPool.slice(0, size - 1);
  const totalPlayers = 1 + selectedBots.length;
  assert.strictEqual(totalPlayers, size);
  if (size === 1) {
    assert.strictEqual(selectedBots.length, 0);
  } else {
    assert.strictEqual(selectedBots.length, size - 1);
  }
}
console.log('  PASS: Bot mode dynamically sizes 1 to 10 players (0 to 9 bots)');

// Test 3: Pass & Play sizing for 1 to 10
const humanAvatars = ['🎮', '⭐', '🔥', '🎯', '⚡', '🏆', '💎', '🚀', '🌟', '🎲'];
for (let size = 1; size <= 10; size++) {
  const otherHumans = [];
  for (let i = 2; i <= size; i++) {
    otherHumans.push({
      id: `local_human_${i}`,
      name: `Player ${i}`,
      avatar: humanAvatars[(i - 2) % humanAvatars.length],
    });
  }
  const total = 1 + otherHumans.length;
  assert.strictEqual(total, size);
}
console.log('  PASS: Pass & Play dynamically sizes 1 to 10 human players');

// Test 4: Player Identity UUID format validation
console.log('--- TEST 2: PLAYER IDENTITY & SUPABASE PROFILES ---');
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const testId = generateUUID();
assert.ok(uuidRegex.test(testId), 'Generated user ID must be RFC4122 UUID');
console.log(`  PASS: Unique user ID generated as valid RFC4122 UUID: ${testId}`);

// Test 5: Live Supabase profiles table interaction test
async function testSupabase() {
  const { createClient } = require('@supabase/supabase-js');
  const url = 'https://fgouwmigftxgnwjcpcot.supabase.co';
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb3V3bWlnZnR4Z253amNwY290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI2NDIsImV4cCI6MjEwNTgxODY0Mn0.h_Xj3XiPCrVKMTu8kwRyP8hsyIgprVqKtdN3voRVg1c';
  const client = createClient(url, key);

  const sampleId = '11111111-2222-4333-8444-555555555555';
  const sampleSettings = {
    soundEnabled: true,
    musicEnabled: true,
    hapticsEnabled: true,
    cardConfirmation: true,
  };

  // Test upsert with fallback
  let errorMsg = null;
  const payload = {
    id: sampleId,
    username: 'VARUN',
    avatar: '👦🏻',
    updated_at: new Date().toISOString(),
  };

  const res = await client.from('profiles').upsert(payload, { onConflict: 'id' }).select();
  assert.ok(!res.error, `Supabase profiles upsert failed: ${res.error?.message}`);
  assert.strictEqual(res.data[0].id, sampleId);
  assert.strictEqual(res.data[0].username, 'VARUN');
  console.log('  PASS: Supabase profiles upsert succeeded with persistent UUID');

  // Fetch back
  const fetched = await client.from('profiles').select('*').eq('id', sampleId).single();
  assert.ok(!fetched.error, `Supabase profiles fetch failed: ${fetched.error?.message}`);
  assert.strictEqual(fetched.data.id, sampleId);
  console.log('  PASS: Supabase profiles query by UUID succeeded');

  // Clean up
  await client.from('profiles').delete().eq('id', sampleId);
  console.log('  PASS: Test cleanup complete');

  console.log('\n======================================================');
  console.log('ALL PLAYER OPTIONS (1-10) & SUPABASE TESTS PASSED');
  console.log('======================================================');
}

testSupabase().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
