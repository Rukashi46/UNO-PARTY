/**
 * SafeStorage - Fail-safe Storage Adapter for UNO PARTY Native
 * Seamlessly abstracts AsyncStorage with an in-memory session store fallback
 * to prevent crashes or LogBox warnings when native storage modules are unlinked.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { devLog, devWarn } from './ErrorMapper';

class SafeStorageService {
  private memoryFallback: Map<string, string> = new Map();
  private isNativeStorageWorking: boolean | null = null;

  private async checkStorageHealth(): Promise<boolean> {
    if (this.isNativeStorageWorking !== null) {
      return this.isNativeStorageWorking;
    }

    try {
      if (!AsyncStorage || typeof AsyncStorage.getItem !== 'function') {
        this.isNativeStorageWorking = false;
        return false;
      }
      // Quick test probe
      await AsyncStorage.getItem('__storage_probe__');
      this.isNativeStorageWorking = true;
      return true;
    } catch (_) {
      devLog('SafeStorage', 'Native AsyncStorage unavailable; using high-speed in-memory storage fallback');
      this.isNativeStorageWorking = false;
      return false;
    }
  }

  async getItem(key: string): Promise<string | null> {
    const isHealthy = await this.checkStorageHealth();
    if (isHealthy) {
      try {
        const val = await AsyncStorage.getItem(key);
        if (val !== null) return val;
      } catch (_) {
        this.isNativeStorageWorking = false;
      }
    }
    return this.memoryFallback.has(key) ? this.memoryFallback.get(key)! : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.memoryFallback.set(key, value);
    const isHealthy = await this.checkStorageHealth();
    if (isHealthy) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (_) {
        this.isNativeStorageWorking = false;
      }
    }
  }

  async removeItem(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    const isHealthy = await this.checkStorageHealth();
    if (isHealthy) {
      try {
        await AsyncStorage.removeItem(key);
      } catch (_) {
        this.isNativeStorageWorking = false;
      }
    }
  }

  async clear(): Promise<void> {
    this.memoryFallback.clear();
    const isHealthy = await this.checkStorageHealth();
    if (isHealthy) {
      try {
        await AsyncStorage.clear();
      } catch (_) {
        this.isNativeStorageWorking = false;
      }
    }
  }
}

export const SafeStorage = new SafeStorageService();
