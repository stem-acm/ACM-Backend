import { EventEmitter } from 'node:events';

class ActivityEventEmitter extends EventEmitter {
  private static instance: ActivityEventEmitter;

  private constructor() {
    super();
  }

  public static getInstance(): ActivityEventEmitter {
    if (!ActivityEventEmitter.instance) {
      ActivityEventEmitter.instance = new ActivityEventEmitter();
    }
    return ActivityEventEmitter.instance;
  }

  public emitActivity(activity: unknown): void {
    this.emit('new-activity', activity);
  }

  public onActivity(callback: (activity: unknown) => void): void {
    this.on('new-activity', callback);
  }

  public removeActivityListener(callback: (activity: unknown) => void): void {
    this.removeListener('new-activity', callback);
  }
}

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

export default {
  checkinEmitter: CheckinEventEmitter.getInstance(),
  activityEmitter: ActivityEventEmitter.getInstance(),
};
