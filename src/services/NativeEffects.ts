import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export class NativeEffectsService {
  private static soundEnabled: boolean = true;
  private static hapticsEnabled: boolean = true;

  static setPreferences(sound: boolean, haptics: boolean) {
    this.soundEnabled = sound;
    this.hapticsEnabled = haptics;
  }

  static triggerCardSelect() {
    if (!this.hapticsEnabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}
  }

  static triggerCardPlay() {
    if (!this.hapticsEnabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
  }

  static triggerUnoCall() {
    if (!this.hapticsEnabled || Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {}
  }

  static triggerInvalidAction() {
    if (!this.hapticsEnabled || Platform.OS === 'web') return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (_) {}
  }

  static triggerTurnChange() {
    if (!this.hapticsEnabled || Platform.OS === 'web') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    } catch (_) {}
  }
}
