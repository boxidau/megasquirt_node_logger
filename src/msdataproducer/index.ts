import MSSerial from '../msserial';
import { LogEntryConfig, OutputChannelConfig } from '../msdecoder';
import MSDecoder from '../msdecoder';
import log from '../logger';
import * as path from 'path';
import * as fs from 'fs';
import * as dateformat from 'dateformat';

interface LoggerOptions {
  pollDelay: number,
  logDir: string,
  loggingEnabled: boolean,
}

export interface OutputChannelData { [key: string]: number };

export default class MSDataProducer {
  private watchdogTimer: NodeJS.Timer | null;
  private outputChannelConfig: { [key: string]: OutputChannelConfig };
  private logEntryConfig: Array<LogEntryConfig>;
  private logFileStream: fs.WriteStream | null;
  private logFileEpoch: number | null;
  private logEntries: number = 0;
  private dataCallbacks: Array<(data: OutputChannelData) => void> = [];
  private lastSuccess: number = 0;
  private scheduledExecTimer: NodeJS.Timer | null;

  FIELD_SEPARATOR: string = "\t";
  WATCHDOG_ACTION_TIME = 500;

  constructor(
    private serial: MSSerial,
    private decoder: MSDecoder, 
    private options: LoggerOptions
  ) {
    log.verbose('MSDataProducer', 'Configuration', options);
    this.outputChannelConfig = this.decoder.getOutputChannelConfigs();
    this.logEntryConfig = this.decoder.getLogEntryConfig();
  }

  public start(): NodeJS.Timer {
    log.info('MSDataProducer', 'Starting logger');
    if (this.options.loggingEnabled) {
      this.initializeLogFile();
    } else {
      log.warn('MSDataProducer', 'Logging to file is disabled');
    }

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

  private initializeLogFile(): void {
    if (!fs.existsSync(this.options.logDir)) {
      log.info('MSDataProducer', 'Creating log directory', this.options.logDir);
      fs.mkdirSync(this.options.logDir, { recursive: false, mode: 0o755 });
    }
    const date = new Date();
    const fileDateStr = dateformat(date, 'yyyy-mm-dd_HH.MM.ss');
    const filePath = path.format({
      dir: this.options.logDir,
      base: `${fileDateStr}.msl`
    });
    log.info('MSDataProducer', 'Creating log file', filePath);
    this.logFileStream = fs.createWriteStream(filePath);
    this.logFileEpoch = Date.now();
    // TODO: read this header info from the controller
    const headerDateStr = dateformat(date, 'ddd mmm dd HH:MM:ss Z yyyy')
    this.writeLine('"MS2Extra comms342aM: MS2/Extra 3.4.2 release  20160421 11:50BST(c)KC/JSM/JB   uSM"');
    this.writeLine(`"Capture Date: ${headerDateStr}"`);
    this.writeLine(this.stringArrayToLogLine(this.getFieldNames()));
    this.writeLine(this.stringArrayToLogLine(this.getUnitNames()));
  }

  private writeLine(line: string): boolean {
    if (this.logFileStream != null && this.options.loggingEnabled) {
      return this.logFileStream.write(line + "\n");
    }
    return false;
  }

  private stringArrayToLogLine(arr: Array<string>): string {
    return arr.join(this.FIELD_SEPARATOR);
  }

  private getFieldNames(): Array<string> {
    return this.logEntryConfig.map(logColumn => logColumn.fieldName);
  }

  private getUnitNames(): Array<string> {
    return this.logEntryConfig.map(logColumn => {
      return this.outputChannelConfig[logColumn.outputChannelName].unit || "";
    });
  }

  public stop(): void {
    this.watchdogTimer.unref();
    this.logFileStream.end();
    this.logFileStream = null;
    this.logFileEpoch = null;
  }

  private handleResponse = (response: Buffer): void => {
    const outputChannelValues = {};
    Object.values(this.outputChannelConfig).map(
      channelConfig => {
        outputChannelValues[channelConfig.name] = channelConfig.extractor(response)
      }
    );
    this.writeDataToLog(outputChannelValues);
    this.dataCallbacks.forEach(cb => cb(outputChannelValues));
  }

  private writeDataToLog = (channelData: OutputChannelData): void => {
    const data = this.logEntryConfig.map(logColumn => {
      if (logColumn.outputChannelName === 'time') {
        return logColumn.formatter((Date.now() - this.logFileEpoch) / 1000);
      }
      const outputChannel = this.outputChannelConfig[logColumn.outputChannelName];
      if (outputChannel == null) {
        log.warn(
          'MSDataProducer',
          'Unknown output channel specified in Datalog config',
          logColumn
        );
        return "";
      }
      return logColumn.formatter(channelData[outputChannel.name]);
    });
    this.writeLine(this.stringArrayToLogLine(data));
    if (++this.logEntries % 1000 === 0) {
      log.info('MSDataProducer', 'Entries written to log file:', this.logEntries);
    }
  }

  private scheduleExecute = (): void => {
    clearTimeout(this.scheduledExecTimer);
    this.scheduledExecTimer = setTimeout(this.execute, this.options.pollDelay);
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
    } catch (err) {
      log.error('MSDataProducer', err);
    } finally {
      this.lastSuccess = Date.now();
      // schedule next poll
      this.scheduleExecute();
    }
  }
}
