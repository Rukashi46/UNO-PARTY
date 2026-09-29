import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, BackHandler, LogBox } from 'react-native';

LogBox.ignoreAllLogs(true);
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SplashScreen } from './src/screens/SplashScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { RulesScreen } from './src/screens/RulesScreen';
import { GameplayScreen } from './src/screens/GameplayScreen';
import { GameMode, GameRules } from './src/types/game';
import { MultiplayerSession } from './src/multiplayer/MultiplayerSession';
import { AppSettingsService } from './src/services/AppSettingsService';
import { ProductionErrorBoundary } from './src/components/common/ProductionErrorBoundary';
import * as ExpoSplashScreen from 'expo-splash-screen';

type AppScreen = 'SPLASH' | 'HOME' | 'SETTINGS' | 'LOBBY' | 'RULES' | 'GAMEPLAY';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('SPLASH');
  const [selectedMode, setSelectedMode] = useState<GameMode>('ONLINE');
  const [matchRules, setMatchRules] = useState<GameRules>({
    deckType: 'NORMAL',
    stacking: true,
    sevenZeroRule: true,
    jumpInRule: true,
    drawUntilPlayable: false,
    forcePlay: false,
    mercy25Cards: true,
    includeCustomWilds: true,
    soundEnabled: true,
    hapticsEnabled: true,
  });

  // Initialize App Settings & Dismiss Native Splash on Mount
  useEffect(() => {
    AppSettingsService.init();
    try {
      ExpoSplashScreen.hideAsync().catch(() => {});
    } catch (_) {}
  }, []);

  // Android Hardware Back Button Handling
  useEffect(() => {
    const onBackPress = () => {
      if (currentScreen === 'SETTINGS') {
        setCurrentScreen('HOME');
        return true;
      }
      if (currentScreen === 'RULES') {
        setCurrentScreen('LOBBY');
        return true;
      }
      if (currentScreen === 'LOBBY') {
        MultiplayerSession.getInstance().leaveRoom();
        setCurrentScreen('HOME');
        return true;
      }
      if (currentScreen === 'GAMEPLAY') {
        setCurrentScreen('LOBBY');
        return true;
      }
      return false; // Let OS exit app from HOME
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [currentScreen]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" hidden={currentScreen === 'GAMEPLAY'} />
        <View style={styles.container}>
          <ProductionErrorBoundary onReset={() => setCurrentScreen('HOME')}>
            {/* 1. Splash Screen */}
            {currentScreen === 'SPLASH' && (
              <SplashScreen onStart={() => setCurrentScreen('HOME')} />
            )}

            {/* 2. Home Screen */}
            {currentScreen === 'HOME' && (
              <SafeAreaView style={styles.safeArea}>
                <HomeScreen
                  onSelectMode={mode => {
                    setSelectedMode(mode);
                    setCurrentScreen('LOBBY');
                  }}
                  onOpenSettings={() => setCurrentScreen('SETTINGS')}
                />
              </SafeAreaView>
            )}

            {/* 3. Settings Screen (Separate from Match Rules) */}
            {currentScreen === 'SETTINGS' && (
              <SafeAreaView style={styles.safeArea}>
                <SettingsScreen onBack={() => setCurrentScreen('HOME')} />
              </SafeAreaView>
            )}

            {/* 4. Lobby Screen (Real Multiplayer) */}
            {currentScreen === 'LOBBY' && (
              <SafeAreaView style={styles.safeArea}>
                <LobbyScreen
                  mode={selectedMode}
                  onStartMatch={() => setCurrentScreen('GAMEPLAY')}
                  onOpenRules={() => setCurrentScreen('RULES')}
                  onBack={() => setCurrentScreen('HOME')}
                />
              </SafeAreaView>
            )}

            {/* 5. Match Rules Screen (Configured from Lobby) */}
            {currentScreen === 'RULES' && (
              <SafeAreaView style={styles.safeArea}>
                <RulesScreen
                  rules={matchRules}
                  isHost={MultiplayerSession.getInstance().isHost()}
                  onUpdateRules={rules => {
                    setMatchRules(rules);
                    MultiplayerSession.getInstance().updateRules(rules);
                  }}
                  onBack={() => setCurrentScreen('LOBBY')}
                />
              </SafeAreaView>
            )}

            {/* 6. Gameplay Screen */}
            {currentScreen === 'GAMEPLAY' && (
              <GameplayScreen onQuit={() => setCurrentScreen('LOBBY')} />
            )}
          </ProductionErrorBoundary>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#040507',
  },
  safeArea: {
    flex: 1,
  },
});
