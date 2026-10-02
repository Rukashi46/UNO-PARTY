import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../constants/theme';
import { GameMode, GameRules, DeckType } from '../types/game';
import { NativeEffectsService } from '../services/NativeEffects';
import { MultiplayerSession } from '../multiplayer/MultiplayerSession';
import { MultiplayerRoom, RoomPlayer, ConnectionStatus, NearbyWlanRoom } from '../multiplayer/types';
import { PlayerIdentityService } from '../services/PlayerIdentityService';
import { AppSettingsService } from '../services/AppSettingsService';
import { getSafeErrorMessage } from '../services/ErrorMapper';
import { MultiplayerDiagnosticsPanel } from '../components/gameplay/MultiplayerDiagnosticsPanel';

interface LobbyScreenProps {
  mode: GameMode;
  onStartMatch: () => void;
  onOpenRules: () => void;
  onBack: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  mode,
  onStartMatch,
  onOpenRules,
  onBack,
}) => {
  const session = MultiplayerSession.getInstance();

  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState<boolean>(false);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Pass & Play Player Slot Editing State (Requirement 21)
  const [editingPassPlayer, setEditingPassPlayer] = useState<RoomPlayer | null>(null);
  const [passEditName, setPassEditName] = useState<string>('');
  const [passEditAvatar, setPassEditAvatar] = useState<string>('👦🏻');

  // WLAN Nearby Rooms State
  const [nearbyRooms, setNearbyRooms] = useState<NearbyWlanRoom[]>([]);
  const [isScanningWlan, setIsScanningWlan] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  // Scan Nearby WLAN Rooms
  const handleScanWlan = useCallback(async () => {
    if (mode !== 'WLAN') return;
    setIsScanningWlan(true);
    try {
      const found = await session.scanNearbyWlanRooms();
      setNearbyRooms(found);
    } catch (_) {
    } finally {
      setIsScanningWlan(false);
    }
  }, [mode, session]);

  // Create Room manually triggered by user action (Requirement 4)
  const handleCreateRoom = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      NativeEffectsService.triggerCardSelect();
      const profile = await PlayerIdentityService.getProfile();
      const userDefaults = AppSettingsService.getSettings();
      const deviceId = await PlayerIdentityService.getDeviceId();

      const player: RoomPlayer = {
        id: profile.id,
        name: profile.displayName,
        avatar: profile.avatar,
        isHost: true,
        isReady: true,
        isConnected: true,
        cardCount: 7,
        controller: 'LOCAL_HUMAN',
        deviceId,
      };

      const rules: GameRules = {
        deckType: userDefaults.defaultDeck || 'NORMAL',
        stacking: userDefaults.defaultStackingEnabled ?? true,
        sevenZeroRule: userDefaults.defaultSevenZeroEnabled ?? (userDefaults.defaultDeck === 'NO_MERCY'),
        jumpInRule: userDefaults.defaultJumpInEnabled ?? true,
        drawUntilPlayable: userDefaults.defaultDrawUntilPlayable ?? false,
        forcePlay: userDefaults.defaultForcePlay ?? false,
        mercy25Cards: userDefaults.defaultDeck === 'NO_MERCY',
        includeCustomWilds: true,
        soundEnabled: userDefaults.soundEnabled ?? true,
        hapticsEnabled: userDefaults.hapticsEnabled ?? true,
        gameEndMode: userDefaults.defaultGameEndMode || 'FIRST_PLAYER_WINS',
      };

      const created = await session.createRoom(mode, player, rules);
      setRoom(created);
      showToast(`Created Room ${created.code}!`);
    } catch (err: any) {
      showToast(getSafeErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  // Initialize Room & Presence
  const initLobby = useCallback(async () => {
    // If returning from rules with an active room in same mode, reuse it
    const existing = session.getRoom();
    if (existing && existing.mode === mode) {
      setRoom(existing);
      return;
    }

    if (mode === 'PLAY_BOTS' || mode === 'PASS_AND_PLAY') {
      const profile = await PlayerIdentityService.getProfile();
      const userDefaults = AppSettingsService.getSettings();
      const deviceId = await PlayerIdentityService.getDeviceId();

      const player: RoomPlayer = {
        id: profile.id,
        name: profile.displayName,
        avatar: profile.avatar,
        isHost: true,
        isReady: true,
        isConnected: true,
        cardCount: 7,
        controller: 'LOCAL_HUMAN',
        deviceId,
      };

      const rules: GameRules = {
        deckType: userDefaults.defaultDeck || 'NORMAL',
        stacking: userDefaults.defaultStackingEnabled ?? true,
        sevenZeroRule: userDefaults.defaultSevenZeroEnabled ?? (userDefaults.defaultDeck === 'NO_MERCY'),
        jumpInRule: userDefaults.defaultJumpInEnabled ?? true,
        drawUntilPlayable: userDefaults.defaultDrawUntilPlayable ?? false,
        forcePlay: userDefaults.defaultForcePlay ?? false,
        mercy25Cards: userDefaults.defaultDeck === 'NO_MERCY',
        includeCustomWilds: true,
        soundEnabled: userDefaults.soundEnabled ?? true,
        hapticsEnabled: userDefaults.hapticsEnabled ?? true,
        gameEndMode: userDefaults.defaultGameEndMode || 'FIRST_PLAYER_WINS',
      };

      const created = await session.createRoom(
        mode,
        player,
        rules,
        `LOCAL-${Math.floor(1000 + Math.random() * 9000)}`
      );
      if (mode === 'PLAY_BOTS') {
        const botNames = ['Sarah', 'Chris', 'Jason'];
        const botAvatars = ['👩🏼', '👨🏽', '🧔🏻‍♂️'];
        if (created.players[0]) {
          created.players[0].controller = 'LOCAL_HUMAN';
        }
        botNames.forEach((name, i) => {
          created.players.push({
            id: `bot_${i + 1}`,
            name,
            avatar: botAvatars[i],
            isHost: false,
            isReady: true,
            isConnected: true,
            cardCount: 7,
            controller: 'BOT',
          });
        });
        created.maxPlayers = 4;
      } else if (mode === 'PASS_AND_PLAY') {
        if (created.players[0]) {
          created.players[0].name = profile.displayName || 'Player 1';
          created.players[0].avatar = profile.avatar || '👦🏻';
          created.players[0].controller = 'LOCAL_HUMAN';
        }
        const humanAvatars = ['🎮', '⭐', '🔥', '🎯'];
        for (let i = 2; i <= 3; i++) {
          created.players.push({
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
        created.maxPlayers = 3;
      }
      setRoom({ ...created, players: [...created.players] });
      setConnectionStatus('CONNECTED');
    } else {
      // CRITICAL: Opening WLAN or Online lobby must NOT create a room! (Requirement 4)
      setRoom(null);
      setConnectionStatus('DISCONNECTED');
      if (mode === 'WLAN') {
        handleScanWlan();
      }
    }
  }, [mode, session, handleScanWlan]);

  useEffect(() => {
    initLobby();

    const unsubRoom = session.onRoomStateChange(r => setRoom(r));
    const unsubConn = session.onConnectionChange(s => setConnectionStatus(s));
    const unsubEvent = session.onEvent(event => {
      if (event.type === 'MATCH_STARTED') {
        onStartMatch();
      }
    });

    return () => {
      unsubRoom();
      unsubConn();
      unsubEvent();
    };
  }, [initLobby, session, onStartMatch]);

  const handleJoinByCode = async () => {
    if (isJoining || !joinCodeInput.trim()) return;
    setIsJoining(true);
    try {
      const identity = await PlayerIdentityService.getIdentity();
      const player: RoomPlayer = {
        id: identity.id,
        name: identity.name,
        avatar: identity.avatar,
        isHost: false,
        isReady: false,
        isConnected: true,
        cardCount: 7,
        deviceId: identity.deviceId,
        controller: 'LOCAL_HUMAN',
      };

      const joined = await session.joinRoom(mode, joinCodeInput.trim().toUpperCase(), player, {
        deviceId: identity.deviceId,
      });
      setRoom(joined);
      setIsJoinModalOpen(false);
      setJoinCodeInput('');
      showToast(`Joined Room ${joined.code}!`);
    } catch (err: any) {
      showToast(getSafeErrorMessage(err));
    } finally {
      setIsJoining(false);
    }
  };

  const handleJoinNearbyRoom = async (nearby: NearbyWlanRoom) => {
    if (isJoining) return;
    setIsJoining(true);
    try {
      const identity = await PlayerIdentityService.getIdentity();
      const player: RoomPlayer = {
        id: identity.id,
        name: identity.name,
        avatar: identity.avatar,
        isHost: false,
        isReady: false,
        isConnected: true,
        cardCount: 7,
        deviceId: identity.deviceId,
        controller: 'LOCAL_HUMAN',
      };

      const joined = await session.joinRoom(mode, nearby.code, player, {
        hostAddress: nearby.hostAddress,
        port: nearby.port,
        deviceId: identity.deviceId,
      });
      setRoom(joined);
      showToast(`Joined ${nearby.hostName}'s Room!`);
    } catch (err: any) {
      showToast(getSafeErrorMessage(err));
    } finally {
      setIsJoining(false);
    }
  };

  const handleSelectDeckType = async (type: DeckType) => {
    if (!session.isHost()) return;
    NativeEffectsService.triggerCardSelect();
    await session.setDeckType(type);
    showToast(`Deck changed to ${type === 'NORMAL' ? 'NORMAL UNO (112 cards)' : 'UNO NO MERCY (168 cards)'}`);
  };

  const handleSelectRoomSize = async (size: number) => {
    NativeEffectsService.triggerCardSelect();
    if (mode === 'PLAY_BOTS') {
      session.setBotCount(size);
      showToast(size === 1 ? 'Solo practice match (1 player)' : `Match set to ${size} players (${size - 1} bots)`);
    } else if (mode === 'PASS_AND_PLAY') {
      session.setPassAndPlayPlayerCount(size);
      showToast(size === 1 ? 'Solo mode (1 player)' : `Match set to ${size} players (Pass & Play)`);
    } else {
      if (!session.isHost()) return;
      await session.setMaxPlayers(size);
      showToast(`Room capacity set to ${size} players`);
    }
  };

  const isHost = session.isHost();
  const roomCode = room?.code || 'ABC123';
  const players = room?.players || [];
  const localPlayer = session.getLocalPlayer();
  const activeDeckType: DeckType = room?.rules.deckType || 'NORMAL';

  return (
    <View style={styles.container}>
      {__DEV__ && <MultiplayerDiagnosticsPanel />}
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            NativeEffectsService.triggerCardSelect();
            if (room) {
              session.leaveRoom();
              setRoom(null);
              if (mode === 'PLAY_BOTS' || mode === 'PASS_AND_PLAY') {
                onBack();
              }
            } else {
              onBack();
            }
          }}
          style={styles.backBtn}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>

        <View style={styles.roomHeader}>
          <Text style={styles.roomCodeTitle}>
            {room
              ? (mode === 'WLAN' ? `WLAN ROOM ${roomCode}` : `ROOM ${roomCode}`)
              : (mode === 'WLAN' ? 'WLAN MULTIPLAYER' : 'ONLINE MULTIPLAYER')}
          </Text>
          <View style={styles.onlineStatusRow}>
            <View
              style={[
                styles.statusDot,
                (room ? connectionStatus === 'CONNECTED' : true) && { backgroundColor: COLORS.unoGreen },
                connectionStatus === 'RECONNECTING' && { backgroundColor: COLORS.unoYellow },
                connectionStatus === 'DISCONNECTED' && { backgroundColor: COLORS.unoRed },
              ]}
            />
            <Text style={styles.onlineLabel}>
              {room
                ? `${mode} • ${players.length}/${room?.maxPlayers || 10} players`
                : (mode === 'WLAN' ? 'Local Wi-Fi Network' : 'Global Online Lobby')}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {room ? (
            <>
              <Pressable
                onPress={() => {
                  NativeEffectsService.triggerCardSelect();
                  showToast(`Room Code ${roomCode} copied!`);
                }}
                style={styles.copyBtn}
              >
                <Text style={styles.copyIcon}>📋</Text>
              </Pressable>

              <Pressable
                onPress={() => setIsJoinModalOpen(true)}
                style={styles.switchRoomBtn}
              >
                <Text style={styles.switchIcon}>🔑</Text>
              </Pressable>
            </>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
      </View>

      {!room ? (
        /* Lobby Selection View: Shown when no room is created or joined yet (Requirement 4 & 8) */
        <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
          {/* Create Room Card */}
          <Pressable
            style={({ pressed }) => [styles.createRoomCard, pressed && styles.cardPressed]}
            onPress={handleCreateRoom}
            disabled={isCreating}
          >
            <View style={styles.createRoomIconBox}>
              <Text style={{ fontSize: 28 }}>👑</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.createRoomTitle}>CREATE ROOM</Text>
              <Text style={styles.createRoomSub}>
                {mode === 'WLAN'
                  ? 'Host a match for nearby devices on this Wi-Fi'
                  : 'Host an online match and invite players with a room code'}
              </Text>
            </View>
            {isCreating ? (
              <ActivityIndicator color={COLORS.goldGlow} size="small" />
            ) : (
              <Text style={styles.createRoomArrow}>›</Text>
            )}
          </Pressable>

          {/* Join with Code Card */}
          <View style={styles.joinCodeCard}>
            <Text style={styles.sectionLabel}>JOIN WITH ROOM CODE</Text>
            <Text style={styles.joinCodeSub}>
              Enter the 6-character room code from the host
            </Text>
            <View style={styles.joinCodeInputRow}>
              <TextInput
                style={styles.joinCodeInput}
                value={joinCodeInput}
                onChangeText={t => setJoinCodeInput(t.toUpperCase())}
                placeholder="e.g. AB7K2Q"
                placeholderTextColor="#64748B"
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.joinCodeSubmitBtn, isJoining && { opacity: 0.6 }]}
                onPress={handleJoinByCode}
                disabled={isJoining || !joinCodeInput.trim()}
              >
                {isJoining ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : (
                  <Text style={styles.joinCodeSubmitText}>JOIN</Text>
                )}
              </Pressable>
            </View>
          </View>

          {/* For WLAN: Nearby Rooms Section (Requirement 8) */}
          {mode === 'WLAN' && (
            <View style={styles.wlanSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>NEARBY WLAN ROOMS</Text>
                <Pressable style={styles.refreshBtn} onPress={handleScanWlan}>
                  {isScanningWlan ? (
                    <ActivityIndicator size="small" color="#F59E0B" />
                  ) : (
                    <Text style={styles.refreshText}>🔄 SCAN AGAIN</Text>
                  )}
                </Pressable>
              </View>

              {nearbyRooms.length > 0 ? (
                <View style={styles.nearbyList}>
                  {nearbyRooms.map(nr => (
                    <View key={nr.code} style={styles.nearbyCard}>
                      <View style={styles.nearbyLeft}>
                        <Text style={styles.nearbyAppTitle}>UNO PARTY</Text>
                        <Text style={styles.nearbyRoomCode}>Room: {nr.code}</Text>
                        <Text style={styles.nearbyMeta}>
                          Host: {nr.hostName} • {nr.playerCount}/{nr.maxPlayers} • {nr.deckType === 'NORMAL' ? 'NORMAL UNO' : 'NO MERCY'}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.nearbyJoinBtn}
                        onPress={() => handleJoinNearbyRoom(nr)}
                        disabled={isJoining}
                      >
                        <Text style={styles.nearbyJoinText}>JOIN</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyWlanCard}>
                  <Text style={styles.emptyWlanEmoji}>📡</Text>
                  <Text style={styles.emptyWlanTitle}>No other rooms on this Wi-Fi yet</Text>
                  <Text style={styles.emptyWlanSub}>
                    Ask the host to tap "Create Room", or tap "Scan Again" once ready.
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        /* Active Room View: Rendered once a room is Created or Joined */
        <>
          <ScrollView contentContainerStyle={styles.contentScroll} showsVerticalScrollIndicator={false}>
            {/* Host Banner */}
            <View style={styles.hostBanner}>
              <View style={styles.hostInfo}>
                <Text style={styles.crownEmoji}>👑</Text>
                <View>
                  <Text style={styles.hostSubtitle}>{isHost ? (mode === 'WLAN' ? 'MY ROOM' : 'ROOM HOST') : 'ROOM HOST'}</Text>
                  <Text style={styles.hostName}>
                    {players.find(p => p.isHost)?.name || 'HOST'}
                  </Text>
                </View>
              </View>
              <View style={styles.leaderBadge}>
                <Text style={styles.leaderText}>{isHost ? 'You are Host' : 'Host Authority'}</Text>
              </View>
            </View>

            {/* Deck Configuration Selector (Part 32) */}
            <View style={styles.deckSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>DECK CONFIGURATION</Text>
                <Text style={styles.deckRuleNotice}>{isHost ? 'Host Controls Deck' : 'Synchronized by Host'}</Text>
              </View>

              <View style={styles.deckToggleRow}>
                {/* Normal UNO: 112 Cards */}
                <Pressable
                  style={[
                    styles.deckChoiceCard,
                    activeDeckType === 'NORMAL' && styles.deckChoiceCardActive,
                    !isHost && styles.deckChoiceCardDisabled,
                  ]}
                  onPress={() => isHost && handleSelectDeckType('NORMAL')}
                >
                  <View style={styles.deckBadgeHeader}>
                    <Text style={styles.deckEmoji}>🃏</Text>
                    {activeDeckType === 'NORMAL' && (
                      <View style={styles.activeCheckBadge}>
                        <Text style={styles.checkText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.deckTitle}>NORMAL UNO</Text>
                  <Text style={styles.deckCount}>112 Cards</Text>
                  <Text style={styles.deckDesc}>
                    Classic 108 + 1 Dedicated Shuffle Hands + 3 Custom Wilds
                  </Text>
                </Pressable>

                {/* UNO No Mercy: 168 Cards */}
                <Pressable
                  style={[
                    styles.deckChoiceCard,
                    styles.deckChoiceNoMercy,
                    activeDeckType === 'NO_MERCY' && styles.deckChoiceNoMercyActive,
                    !isHost && styles.deckChoiceCardDisabled,
                  ]}
                  onPress={() => isHost && handleSelectDeckType('NO_MERCY')}
                >
                  <View style={styles.deckBadgeHeader}>
                    <Text style={styles.deckEmoji}>🔥</Text>
                    {activeDeckType === 'NO_MERCY' && (
                      <View style={[styles.activeCheckBadge, { backgroundColor: '#EF4444' }]}>
                        <Text style={styles.checkText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.deckTitle}>UNO NO MERCY</Text>
                  <Text style={styles.deckCount}>168 Cards</Text>
                  <Text style={styles.deckDesc}>
                    +6, +10, Discard All, Skip Everyone, Color Roulette, 7-Swap & 0-Pass
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Room Size / Player Count Selector */}
            <View style={styles.roomSizeSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>
                  {mode === 'PLAY_BOTS' ? 'MATCH SIZE / BOTS' : 'ROOM CAPACITY'}
                </Text>
                <Text style={styles.deckRuleNotice}>
                  {mode === 'PLAY_BOTS'
                    ? `${players.length} Total (You + ${players.length - 1} Bots)`
                    : isHost
                    ? 'Host Controls Capacity'
                    : `Max Capacity: ${room?.maxPlayers || 10} Players`}
                </Text>
              </View>

              <View style={styles.roomSizeRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(size => {
                  const isSelected = (mode === 'PLAY_BOTS' || mode === 'PASS_AND_PLAY')
                    ? players.length === size
                    : (room?.maxPlayers || 10) === size;
                  const disabled = !isHost && mode !== 'PLAY_BOTS' && mode !== 'PASS_AND_PLAY';

                  return (
                    <Pressable
                      key={size}
                      disabled={disabled}
                      style={[
                        styles.roomSizePill,
                        isSelected && styles.roomSizePillActive,
                        disabled && styles.roomSizePillDisabled,
                      ]}
                      onPress={() => handleSelectRoomSize(size)}
                    >
                      <Text style={[styles.roomSizeNumber, isSelected && styles.roomSizeNumberActive]}>
                        {size}
                      </Text>
                      <Text style={[styles.roomSizeLabel, isSelected && styles.roomSizeLabelActive]}>
                        {size === 1 ? '1 PLAYER' : `${size} PLAYERS`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Nearby WLAN Rooms (Part 15) */}
            {mode === 'WLAN' && (
              <View style={styles.wlanSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>NEARBY WLAN ROOMS</Text>
                  <Pressable style={styles.refreshBtn} onPress={handleScanWlan}>
                    {isScanningWlan ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <Text style={styles.refreshText}>🔄 SCAN AGAIN</Text>
                    )}
                  </Pressable>
                </View>

                {nearbyRooms.length > 0 ? (
                  <View style={styles.nearbyList}>
                    {nearbyRooms.map(nr => (
                      <View key={nr.code} style={styles.nearbyCard}>
                        <View style={styles.nearbyLeft}>
                          <Text style={styles.nearbyAppTitle}>UNO PARTY</Text>
                          <Text style={styles.nearbyRoomCode}>Room: {nr.code}</Text>
                          <Text style={styles.nearbyMeta}>
                            Host: {nr.hostName} • {nr.playerCount}/{nr.maxPlayers} • {nr.deckType === 'NORMAL' ? 'NORMAL UNO' : 'NO MERCY'}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.nearbyJoinBtn}
                          onPress={() => handleJoinNearbyRoom(nr)}
                        >
                          <Text style={styles.nearbyJoinText}>JOIN</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyWlanCard}>
                    <Text style={styles.emptyWlanEmoji}>📡</Text>
                    <Text style={styles.emptyWlanTitle}>No other rooms on this Wi-Fi yet</Text>
                    <Text style={styles.emptyWlanSub}>
                      Other devices on the same Wi-Fi can join via room code: {roomCode}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Connected Players Section */}
            <View style={styles.playersSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>CONNECTED PLAYERS ({players.length})</Text>
                <Text style={styles.readyLabel}>Status</Text>
              </View>

              <View style={styles.playersList}>
                {players.map((p, idx) => (
                  <View key={p.id || idx} style={styles.playerCard}>
                    <View style={styles.playerLeft}>
                      <View style={styles.playerAvatarCircle}>
                        <Text style={styles.playerAvatarEmoji}>{p.avatar}</Text>
                      </View>
                      <View>
                        <Text style={styles.playerNameText}>
                          {p.name} {mode === 'PASS_AND_PLAY' ? `(Slot ${idx + 1})` : p.id === localPlayer?.id ? '(You)' : ''}
                        </Text>
                        {p.isHost && mode !== 'PASS_AND_PLAY' && <Text style={styles.hostTag}>Room Leader</Text>}
                        {mode === 'PASS_AND_PLAY' && (
                          <Text style={styles.passPlaySlotTag}>
                            {idx === 0 ? 'Device Owner (Default)' : 'Pass Player'}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.playerRightStatus}>
                      {mode === 'PASS_AND_PLAY' ? (
                        <Pressable
                          style={styles.slotEditBtn}
                          onPress={() => {
                            NativeEffectsService.triggerCardSelect();
                            setEditingPassPlayer(p);
                            setPassEditName(p.name);
                            setPassEditAvatar(p.avatar);
                          }}
                        >
                          <Text style={styles.slotEditText}>✎ EDIT</Text>
                        </Pressable>
                      ) : (
                        <>
                          {p.isReady ? (
                            <View style={styles.readyBadge}>
                              <Text style={styles.readyBadgeText}>✓ READY</Text>
                            </View>
                          ) : (
                            <View style={styles.waitingBadge}>
                              <Text style={styles.waitingBadgeText}>WAITING</Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.greenLight,
                              !p.isConnected && { backgroundColor: COLORS.unoRed },
                            ]}
                          />
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Match Style Preview Card */}
            <Pressable
              onPress={() => {
                NativeEffectsService.triggerCardSelect();
                onOpenRules();
              }}
              style={styles.rulesPreviewCard}
            >
              <View style={styles.rulesCardLeft}>
                <View style={styles.fireBox}>
                  <Text style={styles.fireEmoji}>⚡</Text>
                </View>
                <View>
                  <Text style={styles.rulesCardSubtitle}>MATCH SETTINGS</Text>
                  <Text style={styles.rulesCardTitle}>
                    {activeDeckType === 'NORMAL' ? 'Modern Party Rules' : 'No Mercy Extreme Rules'}
                  </Text>
                  <Text style={styles.rulesHighlights}>
                    Deck: {activeDeckType} • Stacking {room?.rules.stacking ? 'ON' : 'OFF'} • End: {room?.rules.gameEndMode === 'PLAY_UNTIL_LAST_PLAYER' ? 'Play to Last' : 'First Wins'}
                  </Text>
                </View>
              </View>
              <Text style={styles.rulesArrow}>›</Text>
            </Pressable>
          </ScrollView>

          {/* Primary Action Button */}
          {isHost ? (
            <Pressable
              style={[styles.startMatchBtn, isStarting && { opacity: 0.6 }]}
              disabled={isStarting}
              onPress={async () => {
                if (isStarting) return;
                // Section 8: Minimum player validation
                if ((mode === 'ONLINE' || mode === 'WLAN') && players.length < 2) {
                  showToast('At least 2 players are required to start a multiplayer match.');
                  return;
                }
                setIsStarting(true);
                NativeEffectsService.triggerUnoCall();
                try {
                  await session.startMatch();
                  onStartMatch();
                } catch (e: any) {
                  showToast(getSafeErrorMessage(e));
                } finally {
                  setIsStarting(false);
                }
              }}
            >
              {isStarting ? (
                <ActivityIndicator size="small" color="#0F172A" />
              ) : (
                <>
                  <Text style={styles.playIcon}>▶</Text>
                  <Text style={styles.startMatchText}>START MATCH</Text>
                </>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.readyBtn, localPlayer?.isReady && styles.readyBtnActive]}
              onPress={async () => {
                NativeEffectsService.triggerCardSelect();
                await session.toggleReady();
              }}
            >
              <Text style={styles.readyBtnText}>
                {localPlayer?.isReady ? '✓ READY (TAP TO UNREADY)' : 'READY UP'}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/* Join Room Code Modal */}
      <Modal visible={isJoinModalOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>ENTER ROOM CODE</Text>
            <Text style={styles.modalSubtitle}>
              {mode === 'WLAN' ? 'Enter the local WLAN room code' : 'Enter the 6-character room code'}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={joinCodeInput}
              onChangeText={setJoinCodeInput}
              placeholder={mode === 'WLAN' ? 'e.g. K7P4Q2' : 'e.g. ABC123'}
              placeholderTextColor="#64748B"
              autoCapitalize="characters"
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setIsJoinModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={styles.modalJoinBtn}
                onPress={handleJoinByCode}
              >
                <Text style={styles.modalJoinText}>JOIN</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pass & Play Slot Edit Modal (Requirement 21) */}
      <Modal
        visible={editingPassPlayer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingPassPlayer(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>EDIT PLAYER SLOT</Text>
            <Text style={styles.modalSubtitle}>Customize name and avatar for this Pass & Play player</Text>
            <TextInput
              style={styles.modalInput}
              value={passEditName}
              onChangeText={setPassEditName}
              placeholder="Player Name"
              placeholderTextColor="#64748B"
              maxLength={20}
              autoCorrect={false}
            />
            <View style={styles.slotAvatarGrid}>
              {['👦🏻', '👩🏼', '🧔🏻‍♂️', '👧🏻', '🐯', '🐼', '🦊', '👑', '🎮', '⭐', '🔥', '🎯', '🚀', '💎'].map(av => (
                <Pressable
                  key={av}
                  style={[
                    styles.slotAvatarOption,
                    passEditAvatar === av && styles.slotAvatarOptionSelected,
                  ]}
                  onPress={() => {
                    NativeEffectsService.triggerCardSelect();
                    setPassEditAvatar(av);
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{av}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.modalBtnRow}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setEditingPassPlayer(null)}
              >
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                style={styles.modalJoinBtn}
                onPress={() => {
                  NativeEffectsService.triggerCardSelect();
                  if (editingPassPlayer) {
                    session.updatePassAndPlayPlayer(
                      editingPassPlayer.id,
                      passEditName.trim() || editingPassPlayer.name,
                      passEditAvatar
                    );
                    setEditingPassPlayer(null);
                  }
                }}
              >
                <Text style={styles.modalJoinText}>SAVE</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Native Toast */}
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#040507',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2,
  },
  roomHeader: {
    alignItems: 'center',
  },
  roomCodeTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  onlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  copyBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyIcon: {
    fontSize: 16,
  },
  switchRoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  switchIcon: {
    fontSize: 16,
  },
  contentScroll: {
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
  },
  hostBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    padding: 14,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  crownEmoji: {
    fontSize: 26,
  },
  hostSubtitle: {
    color: COLORS.goldGlow,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  hostName: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
  },
  leaderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: COLORS.goldGlow,
  },
  leaderText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
  },
  deckSection: {
    gap: 10,
  },
  deckRuleNotice: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  deckToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  deckChoiceCard: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
  },
  deckChoiceCardActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    borderColor: '#3B82F6',
  },
  deckChoiceNoMercy: {
    backgroundColor: 'rgba(45, 21, 21, 0.5)',
  },
  deckChoiceNoMercyActive: {
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
    borderColor: '#EF4444',
  },
  deckChoiceCardDisabled: {
    opacity: 0.9,
  },
  roomSizeSection: {
    gap: 10,
  },
  roomSizeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roomSizePill: {
    flexBasis: '18%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  roomSizePillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderColor: COLORS.goldGlow,
    shadowColor: COLORS.goldGlow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  roomSizePillDisabled: {
    opacity: 0.5,
  },
  roomSizeNumber: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 1,
  },
  roomSizeNumberActive: {
    color: COLORS.goldGlow,
  },
  roomSizeLabel: {
    color: '#64748B',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  roomSizeLabelActive: {
    color: '#FFF',
    fontWeight: '900',
  },
  deckBadgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  deckEmoji: {
    fontSize: 22,
  },
  activeCheckBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  checkText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  deckTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  deckCount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F59E0B',
    marginBottom: 4,
  },
  deckDesc: {
    fontSize: 10,
    color: '#94A3B8',
    lineHeight: 14,
  },
  wlanSection: {
    gap: 10,
  },
  refreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderRadius: 8,
  },
  refreshText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  nearbyList: {
    gap: 10,
  },
  nearbyCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    padding: 14,
  },
  nearbyLeft: {
    flex: 1,
  },
  nearbyAppTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 1,
  },
  nearbyRoomCode: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
    marginVertical: 2,
  },
  nearbyMeta: {
    fontSize: 11,
    color: '#94A3B8',
  },
  nearbyJoinBtn: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  nearbyJoinText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  emptyWlanCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    alignItems: 'center',
  },
  emptyWlanEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyWlanTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#CBD5E1',
    marginBottom: 4,
  },
  emptyWlanSub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  playersSection: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  readyLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  playersList: {
    gap: 8,
  },
  playerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  playerAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarEmoji: {
    fontSize: 20,
  },
  playerNameText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  hostTag: {
    color: COLORS.goldGlow,
    fontSize: 10,
    fontWeight: '800',
  },
  playerRightStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readyBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readyBadgeText: {
    color: '#4ADE80',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  waitingBadge: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  waitingBadgeText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  greenLight: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.unoGreen,
  },
  rulesPreviewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
  },
  rulesCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fireBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireEmoji: {
    fontSize: 18,
  },
  rulesCardSubtitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  rulesCardTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  rulesHighlights: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  rulesArrow: {
    color: '#64748B',
    fontSize: 22,
    fontWeight: '300',
  },
  startMatchBtn: {
    backgroundColor: '#F59E0B',
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  playIcon: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
  },
  startMatchText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  readyBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyBtnActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderWidth: 1.5,
    borderColor: '#4ADE80',
  },
  readyBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0F172A',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 6,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '800',
  },
  modalJoinBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalJoinText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  toast: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  slotEditBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  slotEditText: {
    color: COLORS.goldGlow,
    fontSize: 11,
    fontWeight: '800',
  },
  passPlaySlotTag: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  slotAvatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 12,
  },
  slotAvatarOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  slotAvatarOptionSelected: {
    borderColor: COLORS.goldGlow,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  createRoomCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  createRoomIconBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createRoomTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  createRoomSub: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 16,
  },
  createRoomArrow: {
    color: COLORS.goldGlow,
    fontSize: 26,
    fontWeight: '600',
  },
  joinCodeCard: {
    backgroundColor: 'rgba(23, 27, 38, 0.85)',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 18,
    gap: 12,
  },
  joinCodeSub: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  joinCodeInputRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  joinCodeInput: {
    flex: 1,
    height: 50,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  joinCodeSubmitBtn: {
    width: 90,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinCodeSubmitText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
});
