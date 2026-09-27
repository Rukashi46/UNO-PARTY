import {
  MultiplayerTransport,
  ConnectionStatus,
  RoomPlayer,
  GameCommand,
  GameEvent,
} from './types';

export class LocalTransport implements MultiplayerTransport {
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private eventListeners: Set<(event: GameEvent) => void> = new Set();
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();

  async connect(_roomCode: string, _player: RoomPlayer): Promise<boolean> {
    this.setConnectionStatus('CONNECTED');
    return true;
  }

  async disconnect(): Promise<void> {
    this.setConnectionStatus('DISCONNECTED');
  }

  async sendCommand(_command: GameCommand): Promise<void> {}

  async broadcastEvent(event: GameEvent): Promise<void> {
    this.notifyEvent(event);
  }

  onEvent(callback: (event: GameEvent) => void): () => void {
    this.eventListeners.add(callback);
    return () => {
      this.eventListeners.delete(callback);
    };
  }

  onConnectionChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.connectionStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  private setConnectionStatus(status: ConnectionStatus) {
    this.connectionStatus = status;
    this.statusListeners.forEach(fn => fn(status));
  }

  private notifyEvent(event: GameEvent) {
    this.eventListeners.forEach(fn => fn(event));
  }
}
