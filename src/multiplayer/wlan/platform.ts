/**
 * Platform bindings for the LAN transport. Native libraries are required
 * lazily so the transport itself stays importable from Node (tests).
 */
import type { RawServer } from './WsServer';
import type { ConnectFn } from './LanDiscovery';

export interface WebSocketLike {
  readyState: number;
  onopen: ((ev?: any) => void) | null;
  onmessage: ((ev: { data: any }) => void) | null;
  onerror: ((ev?: any) => void) | null;
  onclose: ((ev?: any) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface WlanPlatform {
  createServer(): RawServer;
  connect: ConnectFn;
  getLocalIp(): Promise<string>;
  createWebSocket(url: string): WebSocketLike;
}

declare const require: any;

export const defaultWlanPlatform: WlanPlatform = {
  createServer() {
    const TcpSocket = require('react-native-tcp-socket');
    return TcpSocket.createServer({ noDelay: true, keepAlive: true }) as RawServer;
  },
  connect(host, port, onConnect) {
    const TcpSocket = require('react-native-tcp-socket');
    return TcpSocket.createConnection({ host, port, interface: undefined }, onConnect);
  },
  async getLocalIp() {
    const Network = require('expo-network');
    try {
      const ip: string = await Network.getIpAddressAsync();
      return ip && ip !== '0.0.0.0' ? ip : '';
    } catch (_) {
      return '';
    }
  },
  createWebSocket(url) {
    return new (globalThis as any).WebSocket(url) as WebSocketLike;
  },
};
