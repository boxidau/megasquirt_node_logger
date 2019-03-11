import MSSerial from '../msserial';
import { OutputChannelConfig } from '../msdecoder';
import MSDecoder from '../msdecoder';
import log from '../logger';

export interface OutputChannelData { [key: string]: number };

export default class MSDataProducer {
  private watchdogTimer: NodeJS.Timer | null;
  private outputChannelConfig: { [key: string]: OutputChannelConfig };
  private dataCallbacks: Array<(data: OutputChannelData) => void> = [];
  private lastSuccess: number = 0;

  WATCHDOG_ACTION_TIME = 500;

  constructor(
    private serial: MSSerial,
    private decoder: MSDecoder
  ) {
    this.outputChannelConfig = this.decoder.getOutputChannelConfigs();
  }

  public start(): NodeJS.Timer {
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
    this.watchdogTimer.unref();
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
    if (Date.now() - this.WATCHDOG_ACTION_TIME > this.lastSuccess) {
      log.verbose('MSDataProducer', 'Watchdog executing');
      this.execute();
    }
  }

  private execute = async (): Promise<void> => {
    try {
      const rawData = await this.serial.fetchRealtimeData()
      this.handleResponse(rawData);
      // schedule next poll
      setTimeout(this.execute, 15);
      this.lastSuccess = Date.now();
    } catch (err) {
      log.error('MSDataProducer', err);
    }
  }
}
