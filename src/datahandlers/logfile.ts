import { OutputChannelData } from '../msdataproducer';
import log from '../logger';
import * as path from 'path';
import * as fs from 'fs';
import * as dateformat from 'dateformat';
import { LogEntryConfig, OutputChannelConfig } from '../msdecoder';
import MSDecoder from '../msdecoder';

export default class LogFileWriter {
    private logEntryConfig: Array<LogEntryConfig>;
    private outputChannelConfig: { [key: string]: OutputChannelConfig };
    private logFileEpoch: number | null;
    private logEntries: number = 0;
    private logFileStream: fs.WriteStream | null;

    FIELD_SEPARATOR: string = "\t";

    constructor(
        private decoder: MSDecoder,
        private logDir: string
    ) {
        this.logEntryConfig = this.decoder.getLogEntryConfig();
        this.outputChannelConfig = this.decoder.getOutputChannelConfigs();
        this.initializeLogFile();
    }

    private initializeLogFile(): void {
        if (this.logFileStream != null) {
            // allow for re-initialization of a new log file
            this.logFileStream.end();
            this.logFileStream = null;
            this.logFileEpoch = null;
        }

        if (!fs.existsSync(this.logDir)) {
            log.info('LogFileWriter', 'Creating log directory', this.logDir);
            fs.mkdirSync(this.logDir, { recursive: false, mode: 0o755 });
        }

        const date = new Date();
        const fileDateStr = dateformat(date, 'yyyy-mm-dd_HH.MM.ss');
        const filePath = path.format({
            dir: this.logDir,
            base: `${fileDateStr}.msl`
        });

        log.info('LogFileWriter', 'Creating log file', filePath);
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
        if (this.logFileStream != null) {
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

    public writeDataToLog = (channelData: OutputChannelData): void => {
        const data = this.logEntryConfig.map(logColumn => {
            if (logColumn.outputChannelName === 'time') {
                return logColumn.formatter((Date.now() - this.logFileEpoch) / 1000);
            }
            const outputChannel = this.outputChannelConfig[logColumn.outputChannelName];
            if (outputChannel == null) {
                log.warn(
                    'LogFileWriter',
                    'Unknown output channel specified in Datalog config',
                    logColumn
                );
                return "";
            }
            return logColumn.formatter(channelData[outputChannel.name]);
        });
        this.writeLine(this.stringArrayToLogLine(data));
        if (++this.logEntries % 1000 === 0) {
            log.info('LogFileWriter', 'Entries written to log file:', this.logEntries);
        }
    }
}