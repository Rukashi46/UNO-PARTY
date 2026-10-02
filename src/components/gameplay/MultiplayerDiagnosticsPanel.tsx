import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView } from 'react-native';
import { MPDiagnostics, DiagnosticsState } from '../../services/MultiplayerDiagnosticsService';
import { MultiplayerSession } from '../../multiplayer/MultiplayerSession';

export const MultiplayerDiagnosticsPanel: React.FC = () => {
  if (!__DEV__) return null;

  const [state, setState] = useState<DiagnosticsState>(MPDiagnostics.getState());
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const session = MultiplayerSession.getInstance();

  useEffect(() => {
    const unsub = MPDiagnostics.subscribe(s => setState(s));
    return unsub;
  }, []);

  const handlePing = async () => {
    try {
      await session.sendPing();
    } catch (_) {}
  };

  const handleTestState = async () => {
    try {
      await session.sendTestState();
    } catch (_) {}
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable
        style={styles.headerButton}
        onPress={() => setIsExpanded(prev => !prev)}
      >
        <Text style={styles.headerButtonText}>
          🛠️ MP DIAGNOSTICS {isExpanded ? '▲' : '▼'} [{state.transport} | {state.connectionStatus}]
        </Text>
      </Pressable>

      {isExpanded && (
        <View style={styles.panel}>
          <Text style={styles.title}>MULTIPLAYER DIAGNOSTICS</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Transport:</Text>
            <Text style={[styles.val, state.transport !== 'NONE' ? styles.valGreen : styles.valGray]}>
              {state.transport}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Room:</Text>
            <Text style={styles.val}>{state.roomId || 'NONE'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Player:</Text>
            <Text style={styles.val}>{state.playerId ? state.playerId.substring(0, 16) : 'NONE'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Connection:</Text>
            <Text style={[styles.val, state.connectionStatus === 'CONNECTED' ? styles.valGreen : styles.valRed]}>
              {state.connectionStatus}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Realtime:</Text>
            <Text style={[styles.val, state.realtimeStatus === 'SUBSCRIBED' ? styles.valGreen : styles.valYellow]}>
              {state.realtimeStatus}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Host:</Text>
            <Text style={styles.val}>{state.hostPlayerId ? state.hostPlayerId.substring(0, 16) : 'NONE'}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Members:</Text>
            <Text style={styles.val}>{state.memberCount}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Revision:</Text>
            <Text style={styles.val}>{state.revision}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Last RX:</Text>
            <Text style={styles.val}>{state.lastRx}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Last TX:</Text>
            <Text style={styles.val}>{state.lastTx}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Ping:</Text>
            <Text style={[styles.val, state.pingMs !== null ? styles.valGreen : styles.valGray]}>
              {state.pingMs !== null ? `${state.pingMs} ms` : 'N/A'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Native WLAN:</Text>
            <Text style={[styles.val, state.nativeWlanAvailable ? styles.valGreen : styles.valRed]}>
              {state.nativeWlanAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Multicast Lock:</Text>
            <Text style={[styles.val, state.multicastLockHeld ? styles.valGreen : styles.valGray]}>
              {state.multicastLockHeld ? 'HELD' : 'RELEASED'}
            </Text>
          </View>

          {/* Test Buttons for Phase 9 and 10 */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.actionBtn} onPress={handlePing}>
              <Text style={styles.actionBtnText}>📡 TEST PING</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={handleTestState}>
              <Text style={styles.actionBtnText}>🔄 TEST STATE</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => setShowLogs(p => !p)}>
              <Text style={styles.actionBtnText}>{showLogs ? 'HIDE LOGS' : 'VIEW LOGS'}</Text>
            </Pressable>
          </View>

          {showLogs && (
            <ScrollView style={styles.logContainer} nestedScrollEnabled>
              {state.logs.map((log, index) => (
                <Text key={index} style={styles.logText}>{log}</Text>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 36,
    right: 12,
    zIndex: 99999,
    maxWidth: 320,
  },
  headerButton: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  headerButtonText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  panel: {
    backgroundColor: '#0A0F1D',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1E293B',
  },
  label: {
    color: '#94A3B8',
    fontSize: 9,
    fontFamily: 'monospace',
  },
  val: {
    color: '#F1F5F9',
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  valGreen: {
    color: '#4ADE80',
  },
  valRed: {
    color: '#F87171',
  },
  valYellow: {
    color: '#FBBF24',
  },
  valGray: {
    color: '#64748B',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 4,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#475569',
  },
  actionBtnText: {
    color: '#E2E8F0',
    fontSize: 8,
    fontWeight: '700',
  },
  logContainer: {
    maxHeight: 120,
    backgroundColor: '#030712',
    marginTop: 6,
    padding: 4,
    borderRadius: 4,
  },
  logText: {
    color: '#A5B4FC',
    fontSize: 8,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
});
