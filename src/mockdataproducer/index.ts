import log from '../logger';

export default class MockDataProducer {
  timer: NodeJS.Timer | null;
  dataCallbacks: Array<(OutputChannelData) => void> = [];
  pollInterval: number;

  fields: Map<string, Sweeper> = new Map([
    ['afr', new Sweeper(10.1, 18.5, 5)],
    ['map', new Sweeper(25, 200, 10)],
    ['tps', new Sweeper(0, 100, 50)],
    ['rpm', new Sweeper(1000, 6000, 25)],
    ['mat', new Sweeper(15, 40, 5)],
    ['clt', new Sweeper(80, 90, 2)],
  ]);

  constructor(pollInterval: number) {
    log.warn('MockDataProducer', 'Producing mock data');
    this.pollInterval = pollInterval;
  }

  public start(): NodeJS.Timer {
    this.timer = setInterval(this.execute, this.pollInterval);
    this.timer.ref();
    return this.timer;
  }

  public registerDataCallback(callback: (OutputChannelData) => void): void {
    this.dataCallbacks.push(callback);
  }

  public stop(): void {
    this.timer.unref();
  }

  execute = (): void => {
    const data = {};
    this.fields.forEach((sweeper, key) => {
      data[key] = sweeper.next();
    });
    this.dataCallbacks.forEach(cb => cb(data));
  }
}

class Sweeper {
  increasing: boolean = true;
  min: number;
  max: number;
  rate: number;
  currentValue: number;

  constructor(min: number, max: number, rate: number = 1) {
    this.min = min;
    this.max = max;
    this.rate = rate / 100;
    this.currentValue = min;
  }

  next(): number {
    this.currentValue += this.rate;
    const range = this.max - this.min;
    const multiplier = Math.sin(this.currentValue);
    return (range * (multiplier + 1) / 2) + this.min;
  }
}
