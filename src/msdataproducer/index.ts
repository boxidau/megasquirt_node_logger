import MSSerial from '../msserial';
import { OutputChannelConfig } from '../msdecoder';
import MSDecoder from '../msdecoder';
import log from '../logger';

export interface OutputChannelData { [key: string]: number };

export default class MSDataProducer {
  private watchdogTimer: NodeJS.Timer | null;
  private outputChannelConfig: { [key: string]: OutputChannelConfig };
  private dataCallbacks: Array<(data: OutputChannelData) => void> = [];
  private lastExecute: number = 0;
  private executor: NodeJS.Timer | null;

  WATCHDOG_ACTION_TIME = 500;

  constructor(
    private serial: MSSerial,
    private decoder: MSDecoder
  ) {
    this.outputChannelConfig = this.decoder.getOutputChannelConfigs();
  }

  public start = (): NodeJS.Timer => {
    this.execute();
    // the watchdog timer just makes sure data is being produced regularly
    // scheduling of the next polling occurs after each data poll
    this.watchdogTimer = setInterval(
      this.executeWatchdog,
      this.WATCHDOG_ACTION_TIME
    );
    return this.watchdogTimer;
  }

  public registerDataCallback(callback: (data: OutputChannelData) => void): void {
    this.dataCallbacks.push(callback);
  }

  public stop(): void {
    clearInterval(this.watchdogTimer);
    clearTimeout(this.executor);
  }

  private handleResponse = (response: Buffer): void => {
    const outputChannelValues: OutputChannelData = {};
    Object.values(this.outputChannelConfig).map(
      channelConfig => {
        outputChannelValues[channelConfig.name] = channelConfig.extractor(response)
      }
    );
    this.dataCallbacks.forEach(cb => cb(outputChannelValues));
  }

  private executeWatchdog = (): void => {
    if (this.lastExecute < Date.now() - this.WATCHDOG_ACTION_TIME) {
      log.warn('MSDataProducer', 'No data for some time, watchdog triggering execution');
      this.execute();
    }
  }

  private execute = async (): Promise<void> => {
    try {
      if (!this.serial.ready()) {
        return;
      }
      const rawData = await this.serial.fetchRealtimeData()
      this.handleResponse(rawData);
      // schedule next poll
      this.executor = setTimeout(this.execute, 15);
      this.lastExecute = Date.now();
    } catch (err) {
      log.error('MSDataProducer', err);
    }
  }
}
