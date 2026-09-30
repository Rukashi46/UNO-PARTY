import { UnoDeckService } from '../game/UnoDeckService';
import { UnoGameEngine } from '../game/UnoGameEngine';
import { UnoCard, UnoColor, GameRules, GamePhase, CustomWildPower, DeckType, Player } from '../types/game';
import { SupabaseTransport } from './SupabaseTransport';
import { WlanTransport } from './WlanTransport';
import { LocalTransport } from './LocalTransport';
import { SupabaseDataService } from './SupabaseDataService';
import {
  MultiplayerTransport,
  MultiplayerMode,
  MultiplayerRoom,
  RoomPlayer,
  GameCommand,
  GameEvent,
  PublicMatchState,
  ConnectionStatus,
  NearbyWlanRoom,
} from './types';
import { ProductionError, devError, devLog, devWarn } from '../services/ErrorMapper';

export class MultiplayerSession {
  private static instance: MultiplayerSession | null = null;

  private transport: MultiplayerTransport | null = null;
  private room: MultiplayerRoom | null = null;
  private localPlayer: RoomPlayer | null = null;
  private mode: MultiplayerMode = 'ONLINE';

  // Authoritative State (Managed by Host)
  private authoritativeDeck: UnoCard[] = [];
  private authoritativeHands: Map<string, UnoCard[]> = new Map();
  private authoritativeDiscard: UnoCard[] = [];
  private authoritativeActiveColor: UnoColor = 'YELLOW';
  private authoritativePendingDraw: number = 0;
  private authoritativeCurrentIndex: number = 0;
  private authoritativeDirection: 'CW' | 'CCW' = 'CW';
  private authoritativePhase: GamePhase = 'NOT_STARTED';
  private authoritativeChoiceOwnerId: string | null = null;
  private authoritativeRevision: number = 1;
  private authoritativeFinishingOrder: string[] = [];
  private authoritativeEliminatedOrder: string[] = [];

  // Deduplication & Stale Command Protection (Parts 20 & 35)
  private seenCommandIds: Set<string> = new Set();

  // Listeners
  private eventListeners: Set<(event: GameEvent) => void> = new Set();
  private stateListeners: Set<(room: MultiplayerRoom) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();

  static getInstance(): MultiplayerSession {
    if (!this.instance) {
      this.instance = new MultiplayerSession();
    }
    return this.instance;
  }

  getRoom(): MultiplayerRoom | null {
    return this.room;
  }

  getLocalPlayer(): RoomPlayer | null {
    return this.localPlayer;
  }

  isHost(): boolean {
    return Boolean(this.localPlayer?.isHost);
  }

  getRevision(): number {
    return this.authoritativeRevision;
  }

  async scanNearbyWlanRooms(): Promise<NearbyWlanRoom[]> {
    if (!this.transport || !(this.transport instanceof WlanTransport)) {
      const tempWlan = new WlanTransport();
      return tempWlan.scanNearbyRooms();
    }
    return this.transport.scanNearbyRooms ? this.transport.scanNearbyRooms() : [];
  }

  async createRoom(
    mode: MultiplayerMode,
    player: RoomPlayer,
    rules: GameRules,
    customCode?: string
  ): Promise<MultiplayerRoom> {
    // If already in a room, leave old room cleanly first (Requirement 17)
    if (this.room) {
      await this.leaveRoom();
    }

    this.mode = mode;
    this.localPlayer = {
      ...player,
      isHost: true,
      isConnected: true,
      isReady: true,
      controller: 'LOCAL_HUMAN',
    };

    const code = (customCode || this.generateRoomCode(mode)).toUpperCase().trim();
    let roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const room: MultiplayerRoom = {
      id: roomId,
      code,
      hostId: player.id,
      status: 'WAITING',
      mode,
      rules,
      maxPlayers: 10,
      players: [{ ...this.localPlayer }],
      createdAt: Date.now(),
    };
    this.room = room;

    await this.initTransport(mode);

    if (mode === 'WLAN' && this.transport?.startAdvertising) {
      await this.transport.startAdvertising({
        code,
        hostName: player.name,
        hostPlayerId: player.id,
        playerCount: 1,
        maxPlayers: 10,
        deckType: rules.deckType || 'NORMAL',
        status: 'WAITING',
      });
    }

    if (mode === 'ONLINE') {
      await SupabaseDataService.syncProfile(player.id, player.name, player.avatar);
      const cloudRoom = await SupabaseDataService.registerRoom(code, player.id, 'ONLINE', rules);
      if (cloudRoom) {
        room.id = cloudRoom.id;
        roomId = cloudRoom.id;
        await SupabaseDataService.joinRoomPlayer(cloudRoom.id, player.id, player.name, player.avatar, true);
      }
    }

    await this.transport?.connect(code, this.localPlayer);

    if (__DEV__) {
      console.log(`[ROOM_CREATE]\ntransport=${mode}\nroomId=${code}\nhostPlayerId=${player.id}`);
    }

    this.notifyState();
    return room;
  }

  async joinRoom(
    mode: MultiplayerMode,
    code: string,
    player: RoomPlayer
  ): Promise<MultiplayerRoom> {
    const formattedCode = code.toUpperCase().trim();

    if (!formattedCode || formattedCode.length < 3) {
      throw new ProductionError('ROOM_NOT_FOUND', 'Please enter a valid room code.');
    }

    // Clean up previous room if joining a different room (Requirement 17)
    if (this.room && this.room.code !== formattedCode) {
      await this.leaveRoom();
    }

    this.mode = mode;
    this.localPlayer = {
      ...player,
      isHost: false,
      isConnected: true,
      isReady: false,
      controller: 'LOCAL_HUMAN',
    };

    if (mode === 'ONLINE') {
      if (__DEV__) {
        console.log(`[ROOM_JOIN_REQUEST]\ntransport=ONLINE\nroomId=${formattedCode}\nplayerId=${player.id}`);
      }

      await SupabaseDataService.syncProfile(player.id, player.name, player.avatar);
      const cloudRoom = await SupabaseDataService.lookupRoom(formattedCode);
      if (!cloudRoom) {
        if (__DEV__) {
          console.log(`[ROOM_JOIN_REJECTED]\ntransport=ONLINE\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=ROOM_NOT_FOUND`);
        }
        throw new ProductionError('ROOM_NOT_FOUND', `Room ${formattedCode} not found.`);
      }

      if (cloudRoom.status === 'CLOSED' || cloudRoom.status === 'FINISHED') {
        if (__DEV__) {
          console.log(`[ROOM_JOIN_REJECTED]\ntransport=ONLINE\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=MATCH_FINISHED`);
        }
        throw new ProductionError('MATCH_STARTED', 'This match has already ended.');
      }

      // Check authoritative room membership (Requirement 6, 13, 18)
      const existingMembers = await SupabaseDataService.fetchRoomPlayers(cloudRoom.id);
      const isAlreadyMember = existingMembers.some(p => p.id === player.id);

      if (!isAlreadyMember) {
        if (existingMembers.length >= (cloudRoom.max_players || 10)) {
          if (__DEV__) {
            console.log(`[ROOM_JOIN_REJECTED]\ntransport=ONLINE\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=ROOM_FULL`);
          }
          throw new ProductionError('ROOM_FULL', `Room ${formattedCode} is full.`);
        }
        if (cloudRoom.status === 'PLAYING') {
          if (__DEV__) {
            console.log(`[ROOM_JOIN_REJECTED]\ntransport=ONLINE\nroomId=${formattedCode}\nplayerId=${player.id}\nreason=MATCH_STARTED`);
          }
          throw new ProductionError('MATCH_STARTED', 'Match has already started.');
        }
        await SupabaseDataService.joinRoomPlayer(cloudRoom.id, player.id, player.name, player.avatar, false);
      } else {
        // Reconnect existing player
        const isHost = existingMembers.find(p => p.id === player.id)?.isHost || false;
        await SupabaseDataService.joinRoomPlayer(cloudRoom.id, player.id, player.name, player.avatar, isHost);
      }

      await this.initTransport(mode);
      const connected = await this.transport?.connect(formattedCode, this.localPlayer);
      if (!connected) {
        throw new Error('Unable to connect to online room channel');
      }

      const updatedMembers = await SupabaseDataService.fetchRoomPlayers(cloudRoom.id);
      const mappedPlayers: RoomPlayer[] = updatedMembers.map(m => ({
        ...m,
        controller: m.id === player.id ? 'LOCAL_HUMAN' : 'REMOTE_HUMAN',
      }));

      if (!mappedPlayers.some(p => p.id === player.id)) {
        mappedPlayers.push({ ...this.localPlayer });
      }

      const room: MultiplayerRoom = {
        id: cloudRoom.id,
        code: formattedCode,
        hostId: cloudRoom.host_player_id || cloudRoom.host_id || '',
        status: cloudRoom.status === 'PLAYING' ? 'PLAYING' : 'WAITING',
        mode: 'ONLINE',
        rules: cloudRoom.rules || {
          deckType: 'NORMAL',
          stacking: true,
          sevenZeroRule: false,
          jumpInRule: true,
          drawUntilPlayable: false,
          forcePlay: false,
          mercy25Cards: false,
          includeCustomWilds: true,
          soundEnabled: true,
          hapticsEnabled: true,
        },
        maxPlayers: cloudRoom.max_players || 10,
        players: mappedPlayers,
      };

      this.room = room;
      if (__DEV__) {
        console.log(`[ROOM_JOIN_ACCEPTED]\ntransport=ONLINE\nroomId=${formattedCode}\nplayerId=${player.id}\nmembers=${mappedPlayers.length}`);
      }
      this.notifyState();
      return room;
    }

    if (mode === 'WLAN') {
      if (__DEV__) {
        console.log(`[ROOM_JOIN_REQUEST]\ntransport=WLAN\nroomId=${formattedCode}\nplayerId=${player.id}`);
      }

      await this.initTransport('WLAN');
      const connected = await this.transport?.connect(formattedCode, this.localPlayer);
      if (!connected) {
        throw new ProductionError('ROOM_NOT_FOUND', `WLAN Room ${formattedCode} not found or unreachable on local network.`);
      }

      const room: MultiplayerRoom = {
        id: `wlan_${formattedCode}`,
        code: formattedCode,
        hostId: '',
        status: 'WAITING',
        mode: 'WLAN',
        rules: {
          deckType: 'NORMAL',
          stacking: true,
          sevenZeroRule: false,
          jumpInRule: true,
          drawUntilPlayable: false,
          forcePlay: false,
          mercy25Cards: false,
          includeCustomWilds: true,
          soundEnabled: true,
          hapticsEnabled: true,
        },
        maxPlayers: 10,
        players: [{ ...this.localPlayer }],
      };

      this.room = room;
      this.notifyState();
      return room;
    }

    // Local modes (PLAY_BOTS / PASS_AND_PLAY)
    await this.initTransport(mode);
    const room: MultiplayerRoom = {
      id: `local_${Date.now()}`,
      code: formattedCode,
      hostId: player.id,
      status: 'WAITING',
      mode,
      rules: {
        deckType: 'NORMAL',
        stacking: true,
        sevenZeroRule: false,
        jumpInRule: true,
        drawUntilPlayable: false,
        forcePlay: false,
        mercy25Cards: false,
        includeCustomWilds: true,
        soundEnabled: true,
        hapticsEnabled: true,
      },
      maxPlayers: 10,
      players: [{ ...this.localPlayer }],
    };
    this.room = room;
    this.notifyState();
    return room;
  }

  private async initTransport(mode: MultiplayerMode) {
    if (this.transport) {
      await this.transport.disconnect();
    }

    if (mode === 'WLAN') {
      this.transport = new WlanTransport();
    } else if (mode === 'ONLINE') {
      this.transport = new SupabaseTransport();
    } else {
      this.transport = new LocalTransport();
    }

    this.transport.onEvent(event => this.handleIncomingEvent(event));
    this.transport.onConnectionChange(status => {
      this.statusListeners.forEach(fn => fn(status));
    });
  }

  async toggleReady(): Promise<void> {
    if (!this.localPlayer || !this.room) return;
    this.localPlayer.isReady = !this.localPlayer.isReady;

    this.room.players = this.room.players.map(p =>
      p.id === this.localPlayer?.id ? { ...p, isReady: this.localPlayer.isReady } : p
    );

    await this.transport?.broadcastEvent({
      type: 'PLAYER_READY',
      playerId: this.localPlayer.id,
      isReady: this.localPlayer.isReady,
    });

    this.notifyState();
  }

  async updateRules(rules: GameRules): Promise<void> {
    if (!this.isHost() || !this.room) return;
    this.room.rules = rules;

    if (this.mode === 'ONLINE') {
      await SupabaseDataService.updateRoomRules(this.room.code, rules);
    }

    await this.transport?.broadcastEvent({
      type: 'RULES_UPDATED',
      rules,
    });

    this.notifyState();
  }

  async setDeckType(deckType: DeckType): Promise<void> {
    if (!this.isHost() || !this.room) return;
    const updatedRules: GameRules = {
      ...this.room.rules,
      deckType,
      // No Mercy built-in: 7-0 and mercy25Cards are active
      sevenZeroRule: deckType === 'NO_MERCY',
      mercy25Cards: deckType === 'NO_MERCY',
    };
    await this.updateRules(updatedRules);
  }

  async setMaxPlayers(max: number): Promise<void> {
    if (!this.isHost() || !this.room) return;
    this.room.maxPlayers = max;

    if (this.mode === 'ONLINE' && this.room.code) {
      SupabaseDataService.updateRoomMaxPlayers(this.room.code, max).catch(() => {});
    }

    if (this.mode === 'WLAN' && this.transport?.startAdvertising) {
      await this.transport.startAdvertising({
        code: this.room.code,
        hostName: this.localPlayer?.name || 'HOST',
        playerCount: this.room.players.length,
        maxPlayers: max,
        deckType: this.room.rules.deckType || 'NORMAL',
        status: 'WAITING',
      });
    }

    await this.transport?.broadcastEvent({
      type: 'ROOM_MAX_PLAYERS_UPDATED',
      maxPlayers: max,
    });

    this.notifyState();
  }

  setBotCount(count: number): void {
    if (!this.room || this.mode !== 'PLAY_BOTS') return;
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
    const hostPlayer: RoomPlayer = {
      ...(this.room.players.find(p => p.isHost) || this.room.players[0]),
      controller: 'LOCAL_HUMAN',
    };
    const selectedBots: RoomPlayer[] = count <= 1 ? [] : botPool.slice(0, count - 1).map((bot, i) => ({
      id: `bot_${i + 1}`,
      name: bot.name,
      avatar: bot.avatar,
      isHost: false,
      isReady: true,
      isConnected: true,
      cardCount: 7,
      controller: 'BOT',
    }));
    this.room.maxPlayers = count;
    this.room.players = [hostPlayer, ...selectedBots];
    this.notifyState();
  }

  setPassAndPlayPlayerCount(count: number): void {
    if (!this.room || this.mode !== 'PASS_AND_PLAY') return;
    const humanAvatars = ['🎮', '⭐', '🔥', '🎯', '⚡', '🏆', '💎', '🚀', '🌟', '🎲'];
    const hostPlayer: RoomPlayer = {
      ...(this.room.players.find(p => p.isHost) || this.room.players[0]),
      name: (this.room.players.find(p => p.isHost) || this.room.players[0]).name || 'Player 1',
      controller: 'LOCAL_HUMAN',
    };
    const otherHumans: RoomPlayer[] = [];
    for (let i = 2; i <= count; i++) {
      otherHumans.push({
        id: `local_human_${i}`,
        name: `Player ${i}`,
        avatar: humanAvatars[(i - 2) % humanAvatars.length],
        isHost: false,
        isReady: true,
        isConnected: true,
        cardCount: 7,
        controller: 'LOCAL_HUMAN',
      });
    }
    this.room.maxPlayers = count;
    this.room.players = [hostPlayer, ...otherHumans];
    this.notifyState();
  }

  updatePassAndPlayPlayer(playerId: string, name: string, avatar: string): void {
    if (!this.room || this.mode !== 'PASS_AND_PLAY') return;
    this.room.players = this.room.players.map(p =>
      p.id === playerId ? { ...p, name: name.trim() || p.name, avatar: avatar || p.avatar } : p
    );
    this.notifyState();
  }

  // Start Match (Host Only)
  async startMatch(): Promise<{ initialPublicState: PublicMatchState; privateHand: UnoCard[] }> {
    if (!this.isHost() || !this.room) {
      throw new ProductionError('ROOM_START_INVALID', 'Only the host can start the match.');
    }

    if (this.room.status !== 'WAITING') {
      throw new ProductionError('MATCH_STARTED', 'Match has already started.');
    }

    // Section 8: Minimum player count validation for multiplayer matches
    if ((this.mode === 'ONLINE' || this.mode === 'WLAN') && this.room.players.length < 2) {
      devWarn('MultiplayerSession', 'Multiplayer match requires at least 2 participants.');
      throw new ProductionError('MIN_PLAYERS_REQUIRED');
    }

    this.authoritativeRevision = 1;
    this.seenCommandIds.clear();

    const deckType = this.room.rules.deckType || 'NORMAL';
    // Part 1: exactly 112 cards for NORMAL, 168 cards for NO_MERCY
    const fullDeck = UnoDeckService.generateDeck(deckType);

    // Section 2: Automated Deck Validation
    const deckValidation = UnoDeckService.validateDeck(fullDeck, deckType);
    if (!deckValidation.valid) {
      devError('MultiplayerSession', 'Deck validation failed:', deckValidation.errors);
      throw new ProductionError('DECK_INVALID', deckValidation.errors.join('; '));
    }

    const hands = new Map<string, UnoCard[]>();

    this.authoritativeFinishingOrder = [];
    this.authoritativeEliminatedOrder = [];

    this.room.players.forEach(p => {
      const playerHand = fullDeck.splice(0, 7);
      hands.set(p.id, playerHand);
      p.cardCount = 7;
      p.status = 'ACTIVE';
      p.finishRank = undefined;
      p.isEliminated = false;
    });

    // Top non-wild card to initiate discard pile
    let top = fullDeck.pop() || null;
    while (top && UnoDeckService.isWildCard(top)) {
      fullDeck.unshift(top);
      top = fullDeck.pop() || null;
    }

    if (!top) {
      top = { id: 'default_start', color: 'RED', value: '7' };
    }

    this.authoritativeDeck = fullDeck;
    this.authoritativeHands = hands;
    this.authoritativeDiscard = [top];
    this.authoritativeActiveColor = top.color;
    this.authoritativePendingDraw = 0;
    this.authoritativeCurrentIndex = 0;
    this.authoritativeDirection = 'CW';
    this.authoritativePhase = 'PLAYING';
    this.authoritativeChoiceOwnerId = null;

    this.room.status = 'PLAYING';

    if (this.mode === 'ONLINE') {
      await SupabaseDataService.updateRoomStatus(this.room.code, 'PLAYING');
    }

    const publicState: PublicMatchState = {
      roomId: this.room.id,
      topCard: top,
      activeColor: top.color,
      currentPlayerId: this.room.players[0].id,
      direction: 'CW',
      pendingDrawStack: 0,
      drawPileCount: fullDeck.length,
      players: [...this.room.players],
      discardPile: [top],
      rules: this.room.rules,
      status: 'PLAYING',
      gamePhase: 'PLAYING',
      choiceOwnerId: undefined,
      revision: this.authoritativeRevision,
    };

    // Broadcast MATCH_STARTED
    await this.transport?.broadcastEvent({
      type: 'MATCH_STARTED',
      initialPublicState: publicState,
      privateHand: hands.get(this.localPlayer?.id || '') || [],
    });

    // Send private hands securely to each joined player (Part 28)
    for (const [playerId, hand] of hands.entries()) {
      if (playerId !== this.localPlayer?.id) {
        await this.transport?.broadcastEvent({
          type: 'PRIVATE_HAND_UPDATE',
          playerId,
          hand,
        });
      }
    }

    this.notifyState();
    return {
      initialPublicState: publicState,
      privateHand: hands.get(this.localPlayer?.id || '') || [],
    };
  }

  // Authoritative Command Submission (Client -> Host)
  private makeCommandId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  async playCard(cardId: string, wildColor?: UnoColor): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'PLAY_CARD',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
      cardId,
      wildColor,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async drawCard(): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'DRAW_CARD',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async chooseWildColor(chosenColor: UnoColor): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'CHOOSE_WILD_COLOR',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
      chosenColor,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async chooseCustomWildPower(power: CustomWildPower): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'CHOOSE_CUSTOM_WILD_POWER',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
      power,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async chooseSwapTarget(targetPlayerId: string): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'CHOOSE_SWAP_TARGET',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
      targetPlayerId,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async chooseRouletteColor(chosenColor: UnoColor): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'CHOOSE_ROULETTE_COLOR',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
      chosenColor,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async acceptDrawStack(): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'ACCEPT_DRAW_STACK',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async callUno(): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'CALL_UNO',
      commandId: this.makeCommandId(),
      playerId: this.localPlayer.id,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  async endTurn(): Promise<void> {
    if (!this.localPlayer) return;
    const cmd: GameCommand = {
      type: 'END_TURN',
      commandId: this.makeCommandId(),
      revision: this.authoritativeRevision,
      playerId: this.localPlayer.id,
    };

    if (this.isHost()) {
      await this.handleAuthoritativeCommand(cmd);
    } else {
      await this.transport?.sendCommand(cmd);
    }
  }

  // Authoritative Command Processing (Host Only - Parts 9, 10, 19, 20, 35)
  async handleAuthoritativeCommand(command: GameCommand): Promise<void> {
    if (!this.isHost() || !this.room) return;
    // In local offline modes, GameplayScreen is the single authoritative game session.
    if (this.mode === 'PLAY_BOTS' || this.mode === 'PASS_AND_PLAY') return;

    // 1. Deduplication Protection (Part 35)
    if (this.seenCommandIds.has(command.commandId)) {
      console.warn(`[AuthoritativeEngine] Duplicate command ignored: ${command.commandId}`);
      return;
    }
    this.seenCommandIds.add(command.commandId);

    const players = this.room.players;
    const currentActivePlayer = players[this.authoritativeCurrentIndex];

    // 2. Turn Authority Validation (Part 9)
    if (
      command.type === 'PLAY_CARD' ||
      command.type === 'DRAW_CARD' ||
      command.type === 'ACCEPT_DRAW_STACK' ||
      command.type === 'END_TURN'
    ) {
      if (command.playerId !== currentActivePlayer.id) {
        console.warn(`[AuthoritativeEngine] Unauthorized turn command from ${command.playerId}. Current: ${currentActivePlayer.id}`);
        return;
      }
    }

    // 3. Option Authority Validation (Part 10)
    if (
      command.type === 'CHOOSE_WILD_COLOR' ||
      command.type === 'CHOOSE_CUSTOM_WILD_POWER' ||
      command.type === 'CHOOSE_SWAP_TARGET' ||
      command.type === 'CHOOSE_ROULETTE_COLOR'
    ) {
      if (this.authoritativeChoiceOwnerId && command.playerId !== this.authoritativeChoiceOwnerId) {
        console.warn(`[AuthoritativeEngine] Unauthorized option choice from ${command.playerId}. Owner: ${this.authoritativeChoiceOwnerId}`);
        return;
      }
    }

    this.authoritativeRevision++;

    // Execute Command Logic
    switch (command.type) {
      case 'PLAY_CARD': {
        const hand = this.authoritativeHands.get(command.playerId) || [];
        const cardIndex = hand.findIndex(c => c.id === command.cardId);
        if (cardIndex === -1) return;

        const card = hand[cardIndex];
        const topCard = this.authoritativeDiscard[this.authoritativeDiscard.length - 1] || null;

        // Authoritative validation
        const canPlay = UnoDeckService.canPlayCard(
          card,
          topCard,
          this.authoritativeActiveColor,
          this.authoritativePendingDraw,
          this.room.rules
        );

        if (!canPlay) return;

        // Remove card from hand
        hand.splice(cardIndex, 1);
        this.authoritativeHands.set(command.playerId, hand);
        this.authoritativeDiscard.push(card);

        // Update card count
        const playerObj = players.find(p => p.id === command.playerId);
        if (playerObj) playerObj.cardCount = hand.length;

        // Broadcast card played (public event - never reveals private hand)
        await this.transport?.broadcastEvent({
          type: 'CARD_PLAYED',
          playerId: command.playerId,
          playedCard: card,
          newCardCount: hand.length,
          activeColor: card.color === 'WILD' ? (command.wildColor || this.authoritativeActiveColor) : card.color,
          pendingDrawStack: this.authoritativePendingDraw,
          revision: this.authoritativeRevision,
        });

        // Resolve special card actions
        await this.resolveAuthoritativeCardPlay(card, command.playerId, command.wildColor);
        break;
      }

      case 'DRAW_CARD': {
        const { drawPile, discardPile } = UnoGameEngine.ensureDrawCards(
          this.authoritativeDeck,
          this.authoritativeDiscard,
          1
        );
        this.authoritativeDeck = drawPile;
        this.authoritativeDiscard = discardPile;

        if (this.authoritativeDeck.length > 0) {
          const drawn = this.authoritativeDeck.pop()!;
          const hand = this.authoritativeHands.get(command.playerId) || [];
          hand.push(drawn);
          this.authoritativeHands.set(command.playerId, hand);

          const playerObj = players.find(p => p.id === command.playerId);
          if (playerObj) playerObj.cardCount = hand.length;

          // Public event (does not expose drawn card)
          await this.transport?.broadcastEvent({
            type: 'CARD_DRAWN',
            playerId: command.playerId,
            newCardCount: hand.length,
            revision: this.authoritativeRevision,
          });

          // Private update ONLY to drawing player
          await this.transport?.broadcastEvent({
            type: 'PRIVATE_HAND_UPDATE',
            playerId: command.playerId,
            hand,
          });
        }
        break;
      }

      case 'CHOOSE_WILD_COLOR': {
        this.authoritativeActiveColor = command.chosenColor;
        this.authoritativePhase = 'PLAYING';
        this.authoritativeChoiceOwnerId = null;

        await this.transport?.broadcastEvent({
          type: 'WILD_COLOR_SELECTED',
          playerId: command.playerId,
          activeColor: command.chosenColor,
          revision: this.authoritativeRevision,
        });

        this.advanceAuthoritativeTurn();
        break;
      }

      case 'CHOOSE_CUSTOM_WILD_POWER': {
        // Section 15 Security Guard: Only the player who played the Custom Wild may choose its power
        if (this.authoritativeChoiceOwnerId && command.playerId !== this.authoritativeChoiceOwnerId) {
          devWarn('MultiplayerSession', 'Unauthorized custom wild power choice rejected:', command.playerId);
          break;
        }

        this.authoritativePhase = 'PLAYING';
        this.authoritativeChoiceOwnerId = null;

        if (command.power === 'SHUFFLE_HANDS') {
          await this.executeAuthoritativeShuffleHands(command.playerId);
        } else if (command.power === 'EVERYONE_PLUS_FOUR') {
          await this.executeAuthoritativeEveryonePlusFour(command.playerId);
        }

        // Card player then chooses wild color
        this.authoritativePhase = 'CHOOSING_WILD_COLOR';
        this.authoritativeChoiceOwnerId = command.playerId;
        await this.transport?.broadcastEvent({
          type: 'PHASE_CHANGED',
          phase: 'CHOOSING_WILD_COLOR',
          choiceOwnerId: command.playerId,
          revision: this.authoritativeRevision,
        });
        break;
      }

      case 'CHOOSE_SWAP_TARGET': {
        this.authoritativePhase = 'PLAYING';
        this.authoritativeChoiceOwnerId = null;

        const p1Hand = this.authoritativeHands.get(command.playerId) || [];
        const p2Hand = this.authoritativeHands.get(command.targetPlayerId) || [];

        this.authoritativeHands.set(command.playerId, p2Hand);
        this.authoritativeHands.set(command.targetPlayerId, p1Hand);

        const p1 = players.find(p => p.id === command.playerId);
        const p2 = players.find(p => p.id === command.targetPlayerId);
        if (p1) p1.cardCount = p2Hand.length;
        if (p2) p2.cardCount = p1Hand.length;

        await this.transport?.broadcastEvent({
          type: 'HANDS_SWAPPED',
          player1Id: command.playerId,
          player2Id: command.targetPlayerId,
          player1CardCount: p2Hand.length,
          player2CardCount: p1Hand.length,
          revision: this.authoritativeRevision,
        });

        // Send private hand updates to the two players
        await this.transport?.broadcastEvent({
          type: 'PRIVATE_HAND_UPDATE',
          playerId: command.playerId,
          hand: p2Hand,
        });
        await this.transport?.broadcastEvent({
          type: 'PRIVATE_HAND_UPDATE',
          playerId: command.targetPlayerId,
          hand: p1Hand,
        });

        this.advanceAuthoritativeTurn();
        break;
      }

      case 'CHOOSE_ROULETTE_COLOR': {
        this.authoritativePhase = 'PLAYING';
        this.authoritativeChoiceOwnerId = null;
        await this.executeAuthoritativeRouletteDraw(command.playerId, command.chosenColor);
        break;
      }

      case 'ACCEPT_DRAW_STACK': {
        const penalty = this.authoritativePendingDraw;
        if (penalty > 0) {
          const { drawPile, discardPile } = UnoGameEngine.ensureDrawCards(
            this.authoritativeDeck,
            this.authoritativeDiscard,
            penalty
          );
          this.authoritativeDeck = drawPile;
          this.authoritativeDiscard = discardPile;

          const hand = this.authoritativeHands.get(command.playerId) || [];
          for (let i = 0; i < penalty; i++) {
            if (this.authoritativeDeck.length > 0) {
              hand.push(this.authoritativeDeck.pop()!);
            }
          }
          this.authoritativeHands.set(command.playerId, hand);

          const p = players.find(pl => pl.id === command.playerId);
          if (p) p.cardCount = hand.length;

          this.authoritativePendingDraw = 0;

          await this.transport?.broadcastEvent({
            type: 'DRAW_STACK_RESOLVED',
            playerId: command.playerId,
            penaltyAmount: penalty,
            revision: this.authoritativeRevision,
          });

          await this.transport?.broadcastEvent({
            type: 'PRIVATE_HAND_UPDATE',
            playerId: command.playerId,
            hand,
          });

          // Player takes penalty and loses turn
          this.advanceAuthoritativeTurn(1);
        }
        break;
      }

      case 'CALL_UNO': {
        await this.transport?.broadcastEvent({
          type: 'UNO_CALLED',
          playerId: command.playerId,
        });
        break;
      }

      case 'END_TURN': {
        this.advanceAuthoritativeTurn();
        break;
      }
    }
  }

  // Card Play Resolution helper
  private async resolveAuthoritativeCardPlay(card: UnoCard, playerId: string, wildColor?: UnoColor) {
    const players = this.room!.players;
    const isNoMercy = this.room!.rules.deckType === 'NO_MERCY';

    // 1. Evaluate Completion & Game End via Authoritative Engine
    const playerList: Player[] = players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHuman: true,
      hand: this.authoritativeHands.get(p.id) || [],
      cardCount: p.cardCount,
      isEliminated: p.isEliminated,
      status: p.status,
      finishRank: p.finishRank,
    }));

    const completionEval = UnoGameEngine.evaluatePlayerCompletion(
      playerList,
      this.room!.rules,
      this.authoritativeFinishingOrder,
      this.authoritativeEliminatedOrder
    );

    this.authoritativeFinishingOrder = completionEval.finishingOrder;
    this.authoritativeEliminatedOrder = completionEval.eliminatedOrder;

    completionEval.updatedPlayers.forEach(up => {
      const rp = players.find(p => p.id === up.id);
      if (rp) {
        rp.status = up.status;
        rp.finishRank = up.finishRank;
        rp.isEliminated = up.isEliminated;
      }
    });

    if (completionEval.justFinishedPlayerId) {
      const finisher = players.find(p => p.id === completionEval.justFinishedPlayerId);
      const rank = finisher?.finishRank || this.authoritativeFinishingOrder.length;
      await this.transport?.broadcastEvent({
        type: 'PLAYER_FINISHED',
        playerId: completionEval.justFinishedPlayerId,
        rank,
        finishingOrder: this.authoritativeFinishingOrder,
        revision: this.authoritativeRevision,
      });
    }

    if (completionEval.isMatchOver) {
      const winner = completionEval.winner || players[0];
      await this.transport?.broadcastEvent({
        type: 'PLAYER_WON',
        winnerId: winner?.id || '',
        winnerName: winner?.name || 'Player',
        finishingOrder: this.authoritativeFinishingOrder,
        finalResults: completionEval.finalResults,
        revision: this.authoritativeRevision,
      });
      return;
    }

    // 2. Draw Stack accumulation
    const drawAmt = UnoDeckService.getDrawAmount(card);
    if (drawAmt > 0) {
      this.authoritativePendingDraw += drawAmt;
    }

    // 3. Special actions
    if (card.value === 'REVERSE') {
      if (players.length === 2) {
        // Reverse acts as Skip with 2 players
        this.advanceAuthoritativeTurn(1);
      } else {
        this.authoritativeDirection = this.authoritativeDirection === 'CW' ? 'CCW' : 'CW';
        this.advanceAuthoritativeTurn();
      }
      return;
    }

    if (card.value === 'SKIP') {
      this.advanceAuthoritativeTurn(1);
      return;
    }

    if (card.value === 'SKIP_EVERYONE') {
      await this.transport?.broadcastEvent({
        type: 'SKIP_EVERYONE_TRIGGERED',
        playerId,
        revision: this.authoritativeRevision,
      });
      // Player takes another turn immediately
      await this.broadcastTurnChange();
      return;
    }

    if (card.value === 'DISCARD_ALL') {
      // Discard all matching color cards
      const playerHand = this.authoritativeHands.get(playerId) || [];
      const { updatedPlayer, updatedDiscard, discardedCount } = UnoGameEngine.executeDiscardAll(
        { id: playerId, name: '', avatar: '', isHuman: true, hand: playerHand, cardCount: playerHand.length },
        this.authoritativeDiscard,
        card.color
      );
      this.authoritativeHands.set(playerId, updatedPlayer.hand);
      this.authoritativeDiscard = updatedDiscard;

      const pObj = players.find(p => p.id === playerId);
      if (pObj) pObj.cardCount = updatedPlayer.hand.length;

      await this.transport?.broadcastEvent({
        type: 'DISCARD_ALL_TRIGGERED',
        playerId,
        color: card.color,
        count: discardedCount,
        revision: this.authoritativeRevision,
      });

      await this.transport?.broadcastEvent({
        type: 'PRIVATE_HAND_UPDATE',
        playerId,
        hand: updatedPlayer.hand,
      });

      this.advanceAuthoritativeTurn();
      return;
    }

    if (card.value === '7' && isNoMercy) {
      // 7 Swap Hands (Mandatory)
      this.authoritativePhase = 'CHOOSING_SWAP_TARGET';
      this.authoritativeChoiceOwnerId = playerId;
      await this.transport?.broadcastEvent({
        type: 'PHASE_CHANGED',
        phase: 'CHOOSING_SWAP_TARGET',
        choiceOwnerId: playerId,
        revision: this.authoritativeRevision,
      });
      return;
    }

    if (card.value === '0' && isNoMercy) {
      // 0 Pass Hands (Mandatory)
      await this.executeAuthoritativePassHands();
      this.advanceAuthoritativeTurn();
      return;
    }

    if (card.value === 'SHUFFLE_HANDS') {
      // Dedicated Shuffle Hands
      await this.executeAuthoritativeShuffleHands(playerId);
      this.authoritativePhase = 'CHOOSING_WILD_COLOR';
      this.authoritativeChoiceOwnerId = playerId;
      await this.transport?.broadcastEvent({
        type: 'PHASE_CHANGED',
        phase: 'CHOOSING_WILD_COLOR',
        choiceOwnerId: playerId,
        revision: this.authoritativeRevision,
      });
      return;
    }

    if (card.value === 'CUSTOM_WILD') {
      this.authoritativePhase = 'CHOOSING_CUSTOM_WILD_POWER';
      this.authoritativeChoiceOwnerId = playerId;
      await this.transport?.broadcastEvent({
        type: 'PHASE_CHANGED',
        phase: 'CHOOSING_CUSTOM_WILD_POWER',
        choiceOwnerId: playerId,
        revision: this.authoritativeRevision,
      });
      return;
    }

    if (card.value === 'WILD_REVERSE_DRAW_FOUR') {
      // Direction MUST change before target selection
      this.authoritativeDirection = this.authoritativeDirection === 'CW' ? 'CCW' : 'CW';
      if (wildColor) this.authoritativeActiveColor = wildColor;
      this.advanceAuthoritativeTurn();
      return;
    }

    if (card.value === 'WILD_COLOR_ROULETTE') {
      // Determine next active player as target
      const step = this.authoritativeDirection === 'CW' ? 1 : -1;
      const targetIndex = (this.authoritativeCurrentIndex + step + players.length) % players.length;
      const targetPlayer = players[targetIndex];

      this.authoritativePhase = 'CHOOSING_ROULETTE_COLOR';
      this.authoritativeChoiceOwnerId = targetPlayer.id;

      await this.transport?.broadcastEvent({
        type: 'PHASE_CHANGED',
        phase: 'CHOOSING_ROULETTE_COLOR',
        choiceOwnerId: targetPlayer.id,
        revision: this.authoritativeRevision,
      });
      return;
    }

    if (UnoDeckService.isWildCard(card)) {
      if (wildColor) {
        this.authoritativeActiveColor = wildColor;
        this.advanceAuthoritativeTurn();
      } else {
        this.authoritativePhase = 'CHOOSING_WILD_COLOR';
        this.authoritativeChoiceOwnerId = playerId;
        await this.transport?.broadcastEvent({
          type: 'PHASE_CHANGED',
          phase: 'CHOOSING_WILD_COLOR',
          choiceOwnerId: playerId,
          revision: this.authoritativeRevision,
        });
      }
      return;
    }

    this.advanceAuthoritativeTurn();
  }

  private async executeAuthoritativeShuffleHands(cardPlayerId: string) {
    const players = this.room!.players;
    const playerList: Player[] = players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHuman: true,
      hand: this.authoritativeHands.get(p.id) || [],
      cardCount: p.cardCount,
      isEliminated: p.isEliminated,
    }));

    const cardPlayerIndex = players.findIndex(p => p.id === cardPlayerId);
    const result = UnoGameEngine.executeShuffleHands(
      playerList,
      cardPlayerIndex,
      this.authoritativeDirection
    );

    // Save redistributed hands
    result.updatedPlayers.forEach(p => {
      this.authoritativeHands.set(p.id, p.hand);
      const roomP = players.find(rp => rp.id === p.id);
      if (roomP) roomP.cardCount = p.hand.length;
    });

    await this.transport?.broadcastEvent({
      type: 'SHUFFLE_AND_REDEAL_HANDS',
      cardPlayerId,
      playerCardCounts: result.cardCounts,
      initialCardCounts: result.initialCardCounts,
      dealingOrder: result.dealingOrder,
      dealSequence: result.dealSequence.map(s => s.playerId),
      totalCards: result.totalCards,
      revision: this.authoritativeRevision,
    });

    // Send private hands
    for (const p of result.updatedPlayers) {
      await this.transport?.broadcastEvent({
        type: 'PRIVATE_HAND_UPDATE',
        playerId: p.id,
        hand: p.hand,
      });
    }
  }

  private async executeAuthoritativeEveryonePlusFour(cardPlayerId: string) {
    const players = this.room!.players;
    // Section 4: Preserve existing stack and add +4 contribution
    this.authoritativePendingDraw += 4;

    for (const p of players) {
      if (p.id !== cardPlayerId && !p.isEliminated && p.status !== 'FINISHED' && p.status !== 'ELIMINATED') {
        const { drawPile, discardPile } = UnoGameEngine.ensureDrawCards(
          this.authoritativeDeck,
          this.authoritativeDiscard,
          4
        );
        this.authoritativeDeck = drawPile;
        this.authoritativeDiscard = discardPile;

        const hand = this.authoritativeHands.get(p.id) || [];
        for (let i = 0; i < 4; i++) {
          if (this.authoritativeDeck.length > 0) hand.push(this.authoritativeDeck.pop()!);
        }
        this.authoritativeHands.set(p.id, hand);
        p.cardCount = hand.length;

        await this.transport?.broadcastEvent({
          type: 'PRIVATE_HAND_UPDATE',
          playerId: p.id,
          hand,
        });
      }
    }
  }

  private async executeAuthoritativePassHands() {
    const players = this.room!.players;
    const playerList: Player[] = players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHuman: true,
      hand: this.authoritativeHands.get(p.id) || [],
      cardCount: p.cardCount,
      isEliminated: p.isEliminated,
    }));

    const { updatedPlayers, cardCounts } = UnoGameEngine.executePassHandsInDirection(
      playerList,
      this.authoritativeDirection
    );

    updatedPlayers.forEach(p => {
      this.authoritativeHands.set(p.id, p.hand);
      const roomP = players.find(rp => rp.id === p.id);
      if (roomP) roomP.cardCount = p.hand.length;
    });

    await this.transport?.broadcastEvent({
      type: 'HANDS_PASSED',
      direction: this.authoritativeDirection,
      playerCardCounts: cardCounts,
      revision: this.authoritativeRevision,
    });

    for (const p of updatedPlayers) {
      await this.transport?.broadcastEvent({
        type: 'PRIVATE_HAND_UPDATE',
        playerId: p.id,
        hand: p.hand,
      });
    }
  }

  private async executeAuthoritativeRouletteDraw(targetPlayerId: string, chosenColor: UnoColor) {
    const players = this.room!.players;
    const targetPlayer = players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) return;

    const hand = this.authoritativeHands.get(targetPlayerId) || [];
    const playerObj: Player = {
      id: targetPlayer.id,
      name: targetPlayer.name,
      avatar: targetPlayer.avatar,
      isHuman: true,
      hand,
      cardCount: hand.length,
    };

    const result = UnoGameEngine.executeColorRouletteDraw(
      playerObj,
      this.authoritativeDeck,
      this.authoritativeDiscard,
      chosenColor
    );

    this.authoritativeDeck = result.updatedDrawPile;
    this.authoritativeDiscard = result.updatedDiscardPile;
    this.authoritativeHands.set(targetPlayerId, result.updatedPlayer.hand);
    targetPlayer.cardCount = result.updatedPlayer.hand.length;

    await this.transport?.broadcastEvent({
      type: 'ROULETTE_DRAW_COMPLETED',
      targetPlayerId,
      chosenColor,
      drawnCount: result.drawnCards.length,
      revision: this.authoritativeRevision,
    });

    await this.transport?.broadcastEvent({
      type: 'PRIVATE_HAND_UPDATE',
      playerId: targetPlayerId,
      hand: result.updatedPlayer.hand,
    });

    // Target loses turn
    this.advanceAuthoritativeTurn(1);
  }

  private advanceAuthoritativeTurn(extraSkips: number = 0) {
    const players = this.room!.players;
    const stepMultiplier = 1 + extraSkips;

    const playerList: Player[] = players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHuman: true,
      hand: this.authoritativeHands.get(p.id) || [],
      cardCount: p.cardCount,
      isEliminated: p.isEliminated,
      status: p.status,
    }));

    this.authoritativeCurrentIndex = UnoGameEngine.getNextActivePlayerIndex(
      playerList,
      this.authoritativeCurrentIndex,
      this.authoritativeDirection,
      stepMultiplier
    );
    this.broadcastTurnChange();
  }

  private async broadcastTurnChange() {
    const nextPlayer = this.room!.players[this.authoritativeCurrentIndex];
    await this.transport?.broadcastEvent({
      type: 'TURN_CHANGED',
      nextPlayerId: nextPlayer.id,
      activeColor: this.authoritativeActiveColor,
      direction: this.authoritativeDirection,
      pendingDrawStack: this.authoritativePendingDraw,
      revision: this.authoritativeRevision,
    });
  }

  // Incoming Events Handler (All Clients)
  private handleIncomingEvent(event: GameEvent) {
    if (!this.room) return;

    switch (event.type) {
      case 'PLAYER_JOINED': {
        const existing = this.room.players.find(p => p.id === event.player.id);
        if (!existing) {
          this.room.players.push(event.player);
          this.notifyState();
        }
        break;
      }

      case 'PLAYER_LEFT': {
        this.room.players = this.room.players.filter(p => p.id !== event.playerId);
        if (event.playerId === this.room.hostId && this.room.players.length > 0) {
          this.room.hostId = this.room.players[0].id;
          if (this.localPlayer?.id === this.room.hostId) {
            this.localPlayer.isHost = true;
          }
          this.notifyListeners({ type: 'HOST_CHANGED', newHostId: this.room.hostId });
        }
        this.notifyState();
        break;
      }

      case 'PLAYER_FINISHED': {
        const p = this.room.players.find(pl => pl.id === event.playerId);
        if (p) {
          p.status = 'FINISHED';
          p.finishRank = event.rank;
        }
        this.notifyState();
        break;
      }

      case 'PLAYER_READY': {
        this.room.players = this.room.players.map(p =>
          p.id === event.playerId ? { ...p, isReady: event.isReady } : p
        );
        this.notifyState();
        break;
      }

      case 'RULES_UPDATED': {
        this.room.rules = event.rules;
        this.notifyState();
        break;
      }

      case 'ROOM_MAX_PLAYERS_UPDATED': {
        this.room.maxPlayers = event.maxPlayers;
        this.notifyState();
        break;
      }

      case 'HOST_CHANGED': {
        this.room.hostId = event.newHostId;
        if (this.localPlayer?.id === event.newHostId) {
          this.localPlayer.isHost = true;
        }
        this.notifyState();
        break;
      }

      case 'MATCH_STARTED': {
        this.room.status = 'PLAYING';
        this.notifyState();
        break;
      }

      case 'PLAYER_WON': {
        if (this.mode === 'ONLINE' && this.room) {
          SupabaseDataService.recordGameHistory(
            this.room.code,
            event.winnerId,
            event.winnerName,
            this.room.players.length,
            this.room.mode
          );
          SupabaseDataService.updateRoomStatus(this.room.code, 'FINISHED');
        }
        break;
      }
    }

    this.notifyListeners(event);
  }

  async leaveRoom(): Promise<void> {
    const currentCode = this.room?.code || '';
    const currentMode = this.mode;
    const currentId = this.localPlayer?.id || '';

    if (this.transport) {
      if (this.mode === 'ONLINE' && this.room && this.localPlayer) {
        SupabaseDataService.leaveRoomPlayer(this.room.id, this.localPlayer.id).catch(() => {});
      }
      if (this.localPlayer) {
        await this.transport.broadcastEvent({
          type: 'PLAYER_LEFT',
          playerId: this.localPlayer.id,
        }).catch(() => {});
      }
      await this.transport.disconnect().catch(() => {});
    }

    if (__DEV__ && currentCode) {
      console.log(`[ROOM_LEAVE]\ntransport=${currentMode}\nroomId=${currentCode}\nplayerId=${currentId}`);
    }

    this.room = null;
    this.localPlayer = null;
    this.transport = null;
    this.seenCommandIds.clear();
    this.authoritativeHands.clear();
    this.authoritativeDeck = [];
    this.authoritativeDiscard = [];
    this.authoritativeFinishingOrder = [];
    this.authoritativeEliminatedOrder = [];

    this.notifyState();
  }

  onEvent(callback: (event: GameEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  onRoomStateChange(callback: (room: MultiplayerRoom | null) => void): () => void {
    this.stateListeners.add(callback as any);
    if (this.room) callback(this.room);
    return () => {
      this.stateListeners.delete(callback as any);
    };
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    if (this.transport) {
      callback(this.transport.getConnectionStatus());
    }
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  private notifyListeners(event: GameEvent) {
    this.eventListeners.forEach(fn => fn(event));
  }

  private notifyState() {
    if (!this.room) {
      this.stateListeners.forEach(fn => fn(null as any));
      return;
    }
    const copy = { ...this.room, players: [...this.room.players] };
    this.stateListeners.forEach(fn => fn(copy));
  }

  private generateRoomCode(mode: MultiplayerMode): string {
    if (mode === 'WLAN') {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}
