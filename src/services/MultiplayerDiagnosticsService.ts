import { NativeModules, Platform } from 'react-native';
import { MultiplayerMode, ConnectionStatus, RoomPlayer, GameCommand, GameEvent } from '../multiplayer/types';

export interface DiagnosticsState {
  transport: MultiplayerMode | 'NONE';
  roomId: string;
  playerId: string;
  deviceId: string;
  connectionStatus: ConnectionStatus;
  realtimeStatus: string;
  hostPlayerId: string;
  memberCount: number;
  members: RoomPlayer[];
  revision: number;
  lastRx: string;
  lastTx: string;
  pingMs: number | null;
  nativeWlanAvailable: boolean;
  multicastLockHeld: boolean;
  logs: string[];
}

class DiagnosticsManager {
  private static instance: DiagnosticsManager | null = null;
  private state: DiagnosticsState = {
    transport: 'NONE',
    roomId: '',
    playerId: '',
    deviceId: '',
    connectionStatus: 'DISCONNECTED',
    realtimeStatus: 'IDLE',
    hostPlayerId: '',
    memberCount: 0,
    members: [],
    revision: 1,
    lastRx: 'NONE',
    lastTx: 'NONE',
    pingMs: null,
    nativeWlanAvailable: false,
    multicastLockHeld: false,
    logs: [],
  };

  private listeners: Set<(state: DiagnosticsState) => void> = new Set();
  private pingTimestamp: number | null = null;

  private constructor() {
    this.checkNativeWlan();
  }

  static getInstance(): DiagnosticsManager {
    if (!this.instance) {
      this.instance = new DiagnosticsManager();
    }
    return this.instance;
  }

  private checkNativeWlan() {
    try {
      const available = Boolean(NativeModules.WlanNativeModule && Platform.OS === 'android');
      this.state.nativeWlanAvailable = available;
    } catch (_) {
      this.state.nativeWlanAvailable = false;
    }
  }

  subscribe(listener: (state: DiagnosticsState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = { ...this.state, members: [...this.state.members], logs: [...this.state.logs] };
    this.listeners.forEach(fn => fn(copy));
  }

  private appendLog(formattedMessage: string) {
    if (__DEV__) {
      console.log(formattedMessage);
    }
    this.state.logs = [formattedMessage, ...this.state.logs.slice(0, 49)];
    this.notify();
  }

  logCreate(transport: MultiplayerMode, roomId: string, playerId: string, deviceId: string) {
    this.state.transport = transport;
    this.state.roomId = roomId;
    this.state.playerId = playerId;
    this.state.deviceId = deviceId;
    this.state.hostPlayerId = playerId;
    this.appendLog(`[MP_CREATE]\ntransport=${transport}\nroomId=${roomId}\nplayerId=${playerId}\ndeviceId=${deviceId}`);
  }

  logTransportStart(transport: MultiplayerMode, status: string) {
    this.state.transport = transport;
    this.appendLog(`[MP_TRANSPORT_START]\ntransport=${transport}\nstatus=${status}`);
  }

  logDiscoveryStart(transport: MultiplayerMode) {
    this.appendLog(`[MP_DISCOVERY_START]\ntransport=${transport}`);
  }

  logDiscovery(roomId: string, hostPlayerId: string, hostAddress: string, hostPort: number) {
    this.appendLog(`[MP_DISCOVERY]\nroomId=${roomId}\nhostPlayerId=${hostPlayerId}\nhostAddress=${hostAddress}\nhostPort=${hostPort}`);
  }

  logConnectStart(transport: MultiplayerMode, roomId: string, hostAddress?: string, hostPort?: number) {
    this.state.connectionStatus = 'CONNECTING';
    this.appendLog(`[MP_CONNECT_START]\ntransport=${transport}\nroomId=${roomId}\nhostAddress=${hostAddress || 'N/A'}\nhostPort=${hostPort || 8088}`);
  }

  logConnectSuccess(transport: MultiplayerMode, roomId: string, connectionId: string) {
    this.state.connectionStatus = 'CONNECTED';
    this.state.roomId = roomId;
    this.appendLog(`[MP_CONNECT_SUCCESS]\ntransport=${transport}\nroomId=${roomId}\nconnectionId=${connectionId}`);
  }

  logConnectFailure(transport: MultiplayerMode, roomId: string, error: string, code: string) {
    this.state.connectionStatus = 'DISCONNECTED';
    this.appendLog(`[MP_CONNECT_FAILURE]\ntransport=${transport}\nroomId=${roomId}\nerror=${error}\ncode=${code}`);
  }

  logJoinSend(roomId: string, playerId: string, deviceId: string) {
    this.state.roomId = roomId;
    this.state.playerId = playerId;
    this.state.deviceId = deviceId;
    this.appendLog(`[MP_JOIN_SEND]\nroomId=${roomId}\nplayerId=${playerId}\ndeviceId=${deviceId}`);
  }

  logJoinReceived(roomId: string, playerId: string, deviceId: string) {
    this.appendLog(`[MP_JOIN_RECEIVED]\nroomId=${roomId}\nplayerId=${playerId}\ndeviceId=${deviceId}`);
  }

  logJoinAccepted(roomId: string, playerId: string, members: RoomPlayer[]) {
    this.state.roomId = roomId;
    this.state.memberCount = members.length;
    this.state.members = members;
    this.state.connectionStatus = 'CONNECTED';
    this.appendLog(`[MP_JOIN_ACCEPTED]\nroomId=${roomId}\nplayerId=${playerId}\nmembers=${members.length}`);
  }

  logJoinRejected(roomId: string, playerId: string, reason: string) {
    this.state.connectionStatus = 'DISCONNECTED';
    this.appendLog(`[MP_JOIN_REJECTED]\nroomId=${roomId}\nplayerId=${playerId}\nreason=${reason}`);
  }

  logRoomState(roomId: string, revision: number, players: RoomPlayer[]) {
    this.state.roomId = roomId;
    this.state.revision = revision;
    this.state.members = players;
    this.state.memberCount = players.length;
    this.appendLog(`[MP_ROOM_STATE]\nroomId=${roomId}\nrevision=${revision}\nplayers=${players.length}`);
  }

  logCommandSend(roomId: string, playerId: string, commandId: string, command: string) {
    this.state.lastTx = command;
    this.appendLog(`[MP_COMMAND_SEND]\nroomId=${roomId}\nplayerId=${playerId}\ncommandId=${commandId}\ncommand=${command}`);
  }

  logCommandReceived(roomId: string, playerId: string, commandId: string, command: string) {
    this.state.lastRx = command;
    this.appendLog(`[MP_COMMAND_RECEIVED]\nroomId=${roomId}\nplayerId=${playerId}\ncommandId=${commandId}\ncommand=${command}`);
  }

  logStateSend(roomId: string, revision: number) {
    this.state.lastTx = `STATE_UPDATE_r${revision}`;
    this.state.revision = revision;
    this.appendLog(`[MP_STATE_SEND]\nroomId=${roomId}\nrevision=${revision}`);
  }

  logStateReceived(roomId: string, revision: number) {
    this.state.lastRx = `STATE_UPDATE_r${revision}`;
    this.state.revision = revision;
    this.appendLog(`[MP_STATE_RECEIVED]\nroomId=${roomId}\nrevision=${revision}`);
  }

  logDisconnect(transport: MultiplayerMode, roomId: string, playerId: string, reason: string) {
    this.state.connectionStatus = 'DISCONNECTED';
    this.appendLog(`[MP_DISCONNECT]\ntransport=${transport}\nroomId=${roomId}\nplayerId=${playerId}\nreason=${reason}`);
  }

  logRealtime(channel: string, status: string, error?: string) {
    this.state.realtimeStatus = status;
    let msg = `[REALTIME]\nchannel=${channel}\nstatus=${status}`;
    if (error) msg += `\nreason=${error}`;
    this.appendLog(msg);
  }

  logWlanMulticast(requested: boolean, acquired: boolean) {
    this.state.multicastLockHeld = acquired;
    this.appendLog(`[WLAN_MULTICAST]\nlockRequested=${requested}\nlockAcquired=${acquired}`);
  }

  logWlanHost(ip: string, port: number, roomId: string) {
    this.appendLog(`[WLAN_HOST]\nip=${ip}\nport=${port}\nroomId=${roomId}`);
  }

  logWlanBeacon(roomId: string, hostPlayerId: string, hostAddress: string, hostPort: number) {
    this.appendLog(`[WLAN_BEACON]\nroomId=${roomId}\nhostPlayerId=${hostPlayerId}\nhostAddress=${hostAddress}\nhostPort=${hostPort}`);
  }

  startPingMeasurement() {
    this.pingTimestamp = Date.now();
  }

  recordPongReceived() {
    if (this.pingTimestamp) {
      const ms = Date.now() - this.pingTimestamp;
      this.state.pingMs = ms;
      this.pingTimestamp = null;
      this.notify();
      return ms;
    }
    return null;
  }

  logGameTx(command: string, playerId: string, cardId: string, roomId: string) {
    this.state.lastTx = `${command}:${cardId}`;
    this.appendLog(`[GAME_TX]\ncommand=${command}\nplayerId=${playerId}\ncardId=${cardId}\nroomId=${roomId}`);
  }

  logGameRxHost(command: string, playerId: string, cardId: string) {
    this.state.lastRx = `${command}:${cardId}`;
    this.appendLog(`[GAME_RX_HOST]\ncommand=${command}\nplayerId=${playerId}\ncardId=${cardId}`);
  }

  logGameValidate(valid: boolean, reason: string) {
    this.appendLog(`[GAME_VALIDATE]\nvalid=${valid}\nreason=${reason}`);
  }

  logGameEngine(action: string, playerId: string) {
    this.appendLog(`[GAME_ENGINE]\naction=${action}\nplayerId=${playerId}`);
  }

  logGameStateChanged(revision: number, discardTop: string, currentPlayerId: string, activeColor: string) {
    this.state.revision = revision;
    this.appendLog(`[GAME_STATE_CHANGED]\nrevision=${revision}\ndiscardTop=${discardTop}\ncurrentPlayerId=${currentPlayerId}\nactiveColor=${activeColor}`);
  }

  logGameStateTx(revision: number, discardTop: string, currentPlayerId: string) {
    this.state.lastTx = `STATE_r${revision}`;
    this.state.revision = revision;
    this.appendLog(`[GAME_STATE_TX]\nrevision=${revision}\ndiscardTop=${discardTop}\ncurrentPlayerId=${currentPlayerId}`);
  }

  logGameStateRx(revision: number, discardTop: string, currentPlayerId: string) {
    this.state.lastRx = `STATE_r${revision}`;
    this.state.revision = revision;
    this.appendLog(`[GAME_STATE_RX]\nrevision=${revision}\ndiscardTop=${discardTop}\ncurrentPlayerId=${currentPlayerId}`);
  }

  logGameStateApplied(revision: number, discardTop: string, currentPlayerId: string) {
    this.state.revision = revision;
    this.appendLog(`[GAME_STATE_APPLIED]\nrevision=${revision}\ndiscardTop=${discardTop}\ncurrentPlayerId=${currentPlayerId}`);
  }

  logOnlineChannel(roomId: string, channel: string, status: string) {
    this.state.realtimeStatus = status;
    this.appendLog(`[ONLINE_CHANNEL]\nroomId=${roomId}\nchannel=${channel}\nstatus=${status}`);
  }

  logWlanHostStart(roomId: string, playerId: string, localIp: string, port: number) {
    this.state.roomId = roomId;
    this.state.playerId = playerId;
    this.appendLog(`[WLAN_HOST_START]\nroomId=${roomId}\nplayerId=${playerId}\nlocalIp=${localIp}\nport=${port}`);
  }

  logWlanBeaconStart(roomId: string, localIp: string, port: number) {
    this.appendLog(`[WLAN_BEACON_START]\nroomId=${roomId}\nlocalIp=${localIp}\nport=${port}`);
  }

  logWlanBeaconRx(roomId: string, hostPlayerId: string, hostIp: string, hostPort: number) {
    this.appendLog(`[WLAN_BEACON_RX]\nroomId=${roomId}\nhostPlayerId=${hostPlayerId}\nhostIp=${hostIp}\nhostPort=${hostPort}`);
  }

  logWlanPingTx(senderId: string, receiverId: string) {
    this.appendLog(`[WLAN_PING_TX]\nfrom=${senderId}\nto=${receiverId}`);
  }

  logWlanPingRx(senderId: string, receiverId: string) {
    this.appendLog(`[WLAN_PING_RX]\nfrom=${senderId}\nto=${receiverId}`);
  }

  logWlanPongTx(senderId: string, receiverId: string) {
    this.appendLog(`[WLAN_PONG_TX]\nfrom=${senderId}\nto=${receiverId}`);
  }

  logWlanPongRx(senderId: string, receiverId: string) {
    this.appendLog(`[WLAN_PONG_RX]\nfrom=${senderId}\nto=${receiverId}`);
  }

  getState(): DiagnosticsState {
    return { ...this.state };
  }
}

export const MPDiagnostics = DiagnosticsManager.getInstance();
