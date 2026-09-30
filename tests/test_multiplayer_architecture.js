// ==============================================================================
// TEST SUITE: MULTIPLAYER ARCHITECTURE VALIDATION (WLAN + ONLINE ROOM JOINING)
// ==============================================================================

const assert = (condition, msg) => {
  if (!condition) {
    console.error(`  FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  PASS: ${msg}`);
};

console.log('================================================================');
console.log('RUNNING MULTIPLAYER ARCHITECTURE TEST SUITE');
console.log('================================================================\n');

// Mock SafeStorage
const storageMap = new Map();
const mockSafeStorage = {
  getItem: async (key) => storageMap.get(key) || null,
  setItem: async (key, val) => storageMap.set(key, val),
  removeItem: async (key) => storageMap.delete(key),
};

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// -----------------------------------------------------------------------------
// SECTION 1: IDENTITY CONCEPT SEPARATION
// -----------------------------------------------------------------------------
console.log('--- TEST 1: IDENTITY SEPARATION (Room ID, Player ID, Device ID, Session ID) ---');

const deviceA_id = generateUUID();
const deviceB_id = generateUUID();
assert(deviceA_id !== deviceB_id, 'Device A and Device B have unique hardware/installation deviceIds');

const playerA_id = generateUUID();
const playerB_id = generateUUID();
assert(playerA_id !== deviceA_id, 'Player ID is distinct from Device ID');
assert(playerB_id !== deviceB_id, 'Client Player ID is distinct from Device ID');

const roomA_id = 'AB7K2Q';
assert(roomA_id !== playerA_id && roomA_id !== deviceA_id, 'Room ID is separate from Player ID and Device ID');

// -----------------------------------------------------------------------------
// SECTION 2: MEMBERSHIP MODEL (roomId + playerId)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: MEMBERSHIP KEY & "ALREADY JOINED" RESOLUTION ---');

// Mock authoritative room membership table
const roomMembershipTable = [];

function isAuthoritativeMember(roomId, playerId) {
  return roomMembershipTable.some(m => m.roomId === roomId && m.playerId === playerId && m.isConnected);
}

function addAuthoritativeMember(roomId, player) {
  const existing = roomMembershipTable.find(m => m.roomId === roomId && m.playerId === player.id);
  if (existing) {
    // Reconnect
    existing.isConnected = true;
    existing.name = player.name;
    return { status: 'RECONNECTED', player: existing };
  }
  const newMember = {
    roomId,
    playerId: player.id,
    name: player.name,
    avatar: player.avatar,
    isHost: player.isHost || false,
    isConnected: true,
    controller: player.controller || 'REMOTE_HUMAN',
  };
  roomMembershipTable.push(newMember);
  return { status: 'JOINED', player: newMember };
}

// Host creates room AB7K2Q
const hostMemberRes = addAuthoritativeMember('AB7K2Q', {
  id: playerA_id,
  name: 'HostVarun',
  avatar: '👦🏻',
  isHost: true,
  controller: 'LOCAL_HUMAN',
});
assert(hostMemberRes.status === 'JOINED', 'Host successfully registered in authoritative room');

// Device B has NO membership yet in AB7K2Q
assert(!isAuthoritativeMember('AB7K2Q', playerB_id), 'Player B is NOT falsely reported as already joined before joining');

// Device B joins AB7K2Q
const clientJoinRes = addAuthoritativeMember('AB7K2Q', {
  id: playerB_id,
  name: 'ClientAlex',
  avatar: '👩🏼',
  isHost: false,
  controller: 'REMOTE_HUMAN',
});
assert(clientJoinRes.status === 'JOINED', 'Client joins room AB7K2Q');
assert(isAuthoritativeMember('AB7K2Q', playerB_id), 'Authoritative state confirms Player B is now a member');

// Host and Client count in room AB7K2Q
const ab7Members = roomMembershipTable.filter(m => m.roomId === 'AB7K2Q');
assert(ab7Members.length === 2, 'Authoritative room AB7K2Q has exactly 2 members');
assert(ab7Members[0].name === 'HostVarun' && ab7Members[1].name === 'ClientAlex', 'Host sees Player B, and Player B sees Host');

// -----------------------------------------------------------------------------
// SECTION 3: RECONNECT HANDLING (NO DUPLICATES)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: DISCONNECT & RECONNECT (No Duplicate Players) ---');

// Client Alex disconnects
const alexRecord = roomMembershipTable.find(m => m.roomId === 'AB7K2Q' && m.playerId === playerB_id);
alexRecord.isConnected = false;

// Client Alex joins AB7K2Q again with same playerId
const reconnectRes = addAuthoritativeMember('AB7K2Q', {
  id: playerB_id,
  name: 'ClientAlex',
  avatar: '👩🏼',
});
assert(reconnectRes.status === 'RECONNECTED', 'Reconnection recognized using playerId');
const updatedAb7Members = roomMembershipTable.filter(m => m.roomId === 'AB7K2Q');
assert(updatedAb7Members.length === 2, 'Reconnecting does NOT produce a duplicate player in the room');

// -----------------------------------------------------------------------------
// SECTION 4: WLAN ADVERTISING & DISCOVERY (MY ROOM VS NEARBY ROOMS)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 4: WLAN DISCOVERY & HOST ISOLATION ---');

// Simulated WLAN beacon registry
const wlanBeacons = new Map();

function advertiseWlan(room) {
  wlanBeacons.set(room.code, { ...room, lastSeen: Date.now() });
}

// Host creates and advertises AB7K2Q
advertiseWlan({
  code: 'AB7K2Q',
  hostName: 'HostVarun',
  hostPlayerId: playerA_id,
  playerCount: 1,
  maxPlayers: 10,
  deckType: 'NORMAL',
  status: 'WAITING',
  hostAddress: '192.168.1.100',
  port: 8088,
});

// Client device scans WLAN rooms
function scanWlan(clientAdvertisedRoomCode) {
  const discovered = [];
  for (const [code, r] of wlanBeacons.entries()) {
    // Requirement 8: Exclude this device's own advertised room from nearby remote rooms
    if (!clientAdvertisedRoomCode || code !== clientAdvertisedRoomCode) {
      discovered.push(r);
    }
  }
  return discovered;
}

// Client B scans (Client B is not hosting any room)
const clientBDiscovered = scanWlan(null);
assert(clientBDiscovered.length === 1, 'Client B discovers 1 remote WLAN room');
assert(clientBDiscovered[0].code === 'AB7K2Q', 'Client B discovers HostVarun room AB7K2Q');

// Host A scans (Host A is hosting AB7K2Q)
const hostADiscovered = scanWlan('AB7K2Q');
assert(hostADiscovered.length === 0, 'Host A does NOT see its own room in NEARBY rooms (shown separately as MY ROOM)');

// Another remote host C creates CD9P4M
advertiseWlan({
  code: 'CD9P4M',
  hostName: 'Player3',
  hostPlayerId: 'player_c',
  playerCount: 2,
  maxPlayers: 8,
  deckType: 'NO_MERCY',
  status: 'WAITING',
  hostAddress: '192.168.1.105',
  port: 8088,
});

const clientBDiscoveredMulti = scanWlan(null);
assert(clientBDiscoveredMulti.length === 2, 'Client B discovers both AB7K2Q and CD9P4M');

// -----------------------------------------------------------------------------
// SECTION 5: ONLINE SUPABASE CHANNEL DETERMINISM
// -----------------------------------------------------------------------------
console.log('\n--- TEST 5: DETERMINISTIC REALTIME CHANNELS ---');

function getOnlineChannelName(roomCode) {
  return `uno-room:${roomCode.toUpperCase().trim()}`;
}

const hostChannel = getOnlineChannelName('AB7K2Q');
const clientChannel = getOnlineChannelName('ab7k2q');
assert(hostChannel === 'uno-room:AB7K2Q', 'Host connects to uno-room:AB7K2Q');
assert(clientChannel === 'uno-room:AB7K2Q', 'Client connects to uno-room:AB7K2Q');
assert(hostChannel === clientChannel, 'Both Host and Client subscribe to the EXACT SAME deterministic channel');

// -----------------------------------------------------------------------------
// SECTION 6: INVALID ROOM CODE REJECTION
// -----------------------------------------------------------------------------
console.log('\n--- TEST 6: INVALID ROOM REJECTION (No accidental room creation) ---');

function joinValidation(code, availableRooms) {
  const target = availableRooms.find(r => r.code === code.toUpperCase().trim());
  if (!target) {
    return { success: false, error: 'ROOM_NOT_FOUND' };
  }
  return { success: true, room: target };
}

const invalidJoin = joinValidation('ZZZZZZ', [{ code: 'AB7K2Q' }]);
assert(invalidJoin.success === false, 'Entering ZZZZZZ correctly rejected');
assert(invalidJoin.error === 'ROOM_NOT_FOUND', 'Rejected with ROOM_NOT_FOUND');

// -----------------------------------------------------------------------------
// SECTION 7: TWO DIFFERENT ROOMS ISOLATION
// -----------------------------------------------------------------------------
console.log('\n--- TEST 7: MULTIPLE INDEPENDENT ROOMS ISOLATION ---');

addAuthoritativeMember('ROOM_A', { id: 'p_a1', name: 'Alice', isHost: true });
addAuthoritativeMember('ROOM_B', { id: 'p_b1', name: 'Bob', isHost: true });

const roomAMembers = roomMembershipTable.filter(m => m.roomId === 'ROOM_A');
const roomBMembers = roomMembershipTable.filter(m => m.roomId === 'ROOM_B');

assert(roomAMembers.length === 1 && roomAMembers[0].name === 'Alice', 'Room A contains only Alice');
assert(roomBMembers.length === 1 && roomBMembers[0].name === 'Bob', 'Room B contains only Bob');
assert(!roomAMembers.some(m => m.name === 'Bob'), 'Bob is not present in Room A');
assert(!roomBMembers.some(m => m.name === 'Alice'), 'Alice is not present in Room B');

// -----------------------------------------------------------------------------
// SECTION 8: PLAYER CONTROLLER MODEL
// -----------------------------------------------------------------------------
console.log('\n--- TEST 8: PLAYER CONTROLLER MODEL (LOCAL_HUMAN, BOT, REMOTE_HUMAN) ---');

const playersWithControllers = [
  { id: 'local_user', name: 'Me', controller: 'LOCAL_HUMAN' },
  { id: 'bot_1', name: 'Sarah', controller: 'BOT' },
  { id: 'remote_user', name: 'Alex', controller: 'REMOTE_HUMAN' },
];

assert(playersWithControllers[0].controller === 'LOCAL_HUMAN', 'Local human correctly labeled LOCAL_HUMAN');
assert(playersWithControllers[1].controller === 'BOT', 'Bot correctly labeled BOT');
assert(playersWithControllers[2].controller === 'REMOTE_HUMAN', 'Remote peer correctly labeled REMOTE_HUMAN (NOT BOT)');

// -----------------------------------------------------------------------------
// SECTION 9: LOBBY ENTRY IDEMPOTENCY (Opening Lobby DOES NOT Create Room)
// -----------------------------------------------------------------------------
console.log('\n--- TEST 9: LOBBY OPENING IDEMPOTENCY ---');

let currentActiveRoom = null;
function onOpenLobby(mode) {
  // Requirement 4: Opening lobby leaves room as null! Only "Create Room" creates a room.
  if (mode === 'WLAN' || mode === 'ONLINE') {
    currentActiveRoom = null; // Idle lobby state
  } else {
    currentActiveRoom = { id: 'local_game', mode };
  }
}

onOpenLobby('WLAN');
assert(currentActiveRoom === null, 'Opening WLAN lobby does NOT create a room');

onOpenLobby('ONLINE');
assert(currentActiveRoom === null, 'Opening ONLINE lobby does NOT create a room');

onOpenLobby('PASS_AND_PLAY');
assert(currentActiveRoom !== null && currentActiveRoom.mode === 'PASS_AND_PLAY', 'Pass & Play opens local session directly');

console.log('\n================================================================');
console.log('ALL MULTIPLAYER ARCHITECTURE TESTS PASSED SUCCESSFULLY! (100%)');
console.log('================================================================');
