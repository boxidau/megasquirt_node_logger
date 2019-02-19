import MSSerial from '../msserial';
import {LogEntryConfig, OutputChannelConfig} from '../msdecoder';
import MSDecoder from '../msdecoder';
import log from '../logger';
import * as path from 'path';
import * as fs from 'fs';
import * as dateformat from 'dateformat';

interface LoggerOptions {
  pollInterval: number,
  logDir: string,
  loggingEnabled: boolean,
}

export default class MSDataLogger {
  timer: NodeJS.Timer | null;
  options: LoggerOptions;
  serial: MSSerial;
  decoder: MSDecoder;
  outputChannelConfig: {[key: string]: OutputChannelConfig};
  logEntryConfig: Array<LogEntryConfig>;
  logFileStream: fs.WriteStream | null;
  logFileEpoch: number | null;


  FIELD_SEPARATOR: string = "\t";

  constructor(serial: MSSerial, decoder: MSDecoder, options: LoggerOptions) {
    log.verbose('MSDatalogger', 'Configuration', options);
    this.options = options;
    this.serial = serial;
    this.decoder = decoder;
    this.outputChannelConfig = decoder.getOutputChannelConfigs();
    this.logEntryConfig = decoder.getLogEntryConfig();
  }

  public start(): NodeJS.Timer {
    log.info('MSDatalogger', 'Starting logger');
    if (this.options.loggingEnabled) {
      this.initializeLogFile();
    } else {
      log.warn('MSDatalogger', 'Logging to file is disabled');
    }

    this.timer = setInterval(this.executeLog, this.options.pollInterval);
    this.timer.ref();
    return this.timer;
  }

  private initializeLogFile(): void {
    if (!fs.existsSync(this.options.logDir)) {
      log.info('MSDatalogger', 'Creating log directory', this.options.logDir);
      fs.mkdirSync(this.options.logDir, {recursive: false, mode: 0o755});
    }
    const date = new Date();
    const fileDateStr = dateformat(date, 'yyyy-mm-dd_HH.MM.ss');
    const filePath = path.format({
      dir: this.options.logDir,
      base: `${fileDateStr}.msl`
    });
    log.info('MSDatalogger', 'Creating log file', filePath);
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
    this.timer.unref();
    this.logFileStream.end();
    this.logFileStream = null;
    this.logFileEpoch = null;
  }

  private writeDataToLog = (response: Buffer): void => {
    const data = this.logEntryConfig.map(logColumn => {
      if (logColumn.outputChannelName === 'time') {
        return logColumn.formatter((Date.now() - this.logFileEpoch) / 1000);
      }
      const outputChannel = this.outputChannelConfig[logColumn.outputChannelName];
      if (outputChannel == null) {
        log.warn(
          'MSDatalogger',
          'Unknown output channel specified in Datalog config',
          logColumn
        );
        return "";
      }
      return logColumn.formatter(outputChannel.extractor(response));
    });
    this.writeLine(this.stringArrayToLogLine(data));
  }

  executeLog = (): void => {
    this.serial.fetchRealtimeData().then(this.writeDataToLog);
  }
}
