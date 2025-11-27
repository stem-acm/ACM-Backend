import { EventEmitter } from 'node:events';

class CheckinEventEmitter extends EventEmitter {
  private static instance: CheckinEventEmitter;

  private constructor() {
    super();
  }

  public static getInstance(): CheckinEventEmitter {
    if (!CheckinEventEmitter.instance) {
      CheckinEventEmitter.instance = new CheckinEventEmitter();
    }
    return CheckinEventEmitter.instance;
  }

  public emitCheckin(checkin: unknown): void {
    this.emit('new-checkin', checkin);
  }

  public onCheckin(callback: (checkin: unknown) => void): void {
    this.on('new-checkin', callback);
  }

  public removeCheckinListener(callback: (checkin: unknown) => void): void {
    this.removeListener('new-checkin', callback);
  }
}

export default CheckinEventEmitter.getInstance();
