const { createClient } = require('@supabase/supabase-js');
const url = 'https://fgouwmigftxgnwjcpcot.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnb3V3bWlnZnR4Z253amNwY290Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDI2NDIsImV4cCI6MjEwNTgxODY0Mn0.h_Xj3XiPCrVKMTu8kwRyP8hsyIgprVqKtdN3voRVg1c';
const client = createClient(url, key);

async function probe() {
  console.log('Probing live Supabase schema...');
  const roomCandidates = [
    'id', 'room_code', 'code', 'room', 'host_id', 'host_player_id', 'host', 'host_address',
    'status', 'state', 'mode', 'game_mode', 'max_players', 'capacity', 'rules', 'settings',
    'created_at', 'updated_at'
  ];
  
  const validRooms = [];
  for (const c of roomCandidates) {
    const { error } = await client.from('rooms').select(c).limit(1);
    if (!error) validRooms.push(c);
  }
  console.log('VALID ROOMS COLUMNS:', validRooms);

  const playerCandidates = [
    'id', 'room_id', 'room_code', 'room', 'code',
    'player_id', 'user_id', 'uid', 'pid',
    'display_name', 'username', 'name', 'player_name', 'nickname',
    'avatar', 'avatar_id', 'photo',
    'is_host', 'host', 'is_ready', 'ready', 'status',
    'is_connected', 'connected', 'online',
    'card_count', 'cards',
    'joined_at', 'created_at', 'updated_at', 'last_seen', 'last_seen_at'
  ];

  const validPlayers = [];
  for (const c of playerCandidates) {
    const { error } = await client.from('room_players').select(c).limit(1);
    if (!error) validPlayers.push(c);
  }
  console.log('VALID ROOM_PLAYERS COLUMNS:', validPlayers);

  process.exit(0);
}

probe().catch(e => {
  console.error(e);
  process.exit(1);
});
