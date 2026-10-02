const { createClient } = require('@supabase/supabase-js');
const url = 'https://fgouwmigftxgnwjcpcot.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb3V3bWlnZnR4Z253amNwY290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI2NDIsImV4cCI6MjEwNTgxODY0Mn0.h_Xj3XiPCrVKMTu8kwRyP8hsyIgprVqKtdN3voRVg1c';
const client = createClient(url, key);

async function testLiveFlow() {
  const testRoomCode = 'TEST' + Math.floor(1000 + Math.random() * 9000);
  console.log('Testing live Supabase flow for room:', testRoomCode);

  // 1. Insert room
  const roomPayload = {
    room_code: testRoomCode,
    host_player_id: 'HOST_123',
    status: 'WAITING',
    mode: 'ONLINE',
    max_players: 10,
    rules: { stacking: true },
    updated_at: Date.now()
  };
  const { data: roomData, error: roomError } = await client.from('rooms').upsert(roomPayload, { onConflict: 'room_code' }).select().single();
  console.log('Insert room result:', { roomData, roomError });

  // 2. Insert host player in room_players
  const hostPlayerPayload = {
    room_code: testRoomCode,
    player_id: 'HOST_123',
    name: 'Host Player',
    avatar: '👦🏻',
    is_host: true,
    last_seen: Date.now()
  };
  const { data: hostData, error: hostError } = await client.from('room_players').upsert(hostPlayerPayload, { onConflict: 'room_code,player_id' }).select().single();
  console.log('Insert host player result:', { hostData, hostError });

  // 3. Insert client player in room_players
  const clientPlayerPayload = {
    room_code: testRoomCode,
    player_id: 'CLIENT_456',
    name: 'Client Player',
    avatar: '🦊',
    is_host: false,
    last_seen: Date.now()
  };
  const { data: clientData, error: clientError } = await client.from('room_players').upsert(clientPlayerPayload, { onConflict: 'room_code,player_id' }).select().single();
  console.log('Insert client player result:', { clientData, clientError });

  // 4. Fetch room players
  const { data: players, error: fetchError } = await client.from('room_players').select('*').eq('room_code', testRoomCode);
  console.log('Fetch room players result:', { players, fetchError });

  // Clean up
  await client.from('room_players').delete().eq('room_code', testRoomCode);
  await client.from('rooms').delete().eq('room_code', testRoomCode);

  console.log('Cleanup finished.');
  process.exit(0);
}

testLiveFlow().catch((e) => {
  console.error('Test failed with error:', e);
  process.exit(1);
});
