import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

interface GameplayViewportProps {
  children: React.ReactNode;
}

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export const GameplayViewport: React.FC<GameplayViewportProps> = ({ children }) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Uniform scale calculation ensuring 100% proportional fit with zero distortion
  const scale = Math.min(windowWidth / DESIGN_WIDTH, windowHeight / DESIGN_HEIGHT);

  return (
    <View style={styles.viewportContainer}>
      <View
        style={[
          styles.gameStage,
          {
            transform: [{ scale }],
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  viewportContainer: {
    flex: 1,
    backgroundColor: '#07060A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gameStage: {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    position: 'absolute',
  },
});
