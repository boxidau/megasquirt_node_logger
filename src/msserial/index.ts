import * as SerialPort from 'serialport';
import * as MockBinding from '@serialport/binding-mock';
import FrameParser from './frameParser';
import { crc32 } from 'crc';
import log from '../logger';
import mockResponses from './mockResponses';

export default class MSSerial {
  private serial: SerialPort;
  private parser: FrameParser;
  private responseResolve: (buffer: Buffer) => void | null;
  private responseReject: (error: Error) => void | null;
  private timeout: NodeJS.Timer | null;

  constructor(
    portName: string,
    baudRate: number = 115200,
    private mock: boolean = false
  ) {
    const options = { baudRate, autoOpen: false };
    if (this.mock) {
      portName = '/dev/ROBOT';
      MockBinding.createPort(portName, { echo: false, record: false });
      options['binding'] = MockBinding;
    }
    this.serial = new SerialPort(portName, options);
    this.parser = this.serial.pipe(new FrameParser());
    this.parser.on('data', this.receiveFrame);
    this.serial.on('close', this.autoReconnect);
    this.serial.on('error', this.reset);
    this.serial.on('open', () => log.info('MSSerial', 'Connected to ' + portName))
    this.serial.open();
  }

  private autoReconnect = () => {
    log.warn('MSSerial', 'Lost serial connection - attempting to reconnect');
    const timerID = setInterval(() => {
      if (!this.ready()) {
        this.serial.open(err => {
          if (err != null) {
            log.error('MSSerial', 'Error opening serial port: ' + err.message);
          } else {
            log.info('MSSerial', 'Connection re-established');
            clearInterval(timerID);
          }
        });
      }
    }, 500);
  }

  private reset = (): void => {
    if (this.responseReject != null) {
      this.responseReject(new Error('Serial port reset'));
    }
    if (this.timeout != null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.parser.reset();
  }

  public ready = (): boolean => {
    return this.serial.isOpen && this.serial.writable;
  }

  private receiveFrame = (frame: Buffer): void => {
    clearTimeout(this.timeout);
    if (this.responseReject == null || this.responseResolve == null) {
      log.warn('MSSerial', 'No handlers registered to recieve frame');
      return;
    }
    log.verbose('MSSerial', 'received frame %j', frame.toString('hex'));
    const dataSize = frame.readUInt16BE(0);
    log.verbose('MSSerial', 'frame data size %j bytes', dataSize);
    // frame starts with length (2 bytes) and ends with CRC32 (4 bytes)
    if (dataSize + 6 !== frame.length) {
      this.responseReject(new Error('Invalid data size in response data'));
    }

    const data = frame.slice(2, dataSize + 2);
    const frameCRC = frame.readUInt32BE(frame.length - 4);
    const calculatedCRC = crc32(data);
    if (frameCRC !== calculatedCRC) {
      this.responseReject(new Error('Invalid checksum'));
    }
    log.verbose('MSSerial', 'frame CRC OK');
    if (this.responseResolve) {
      this.responseResolve(data);
    } else {
      log.warn(
        'MSSerial',
        'No resolver registered, unexpected data frame from device?'
      );
    }
  }

  public async fetchRealtimeData(): Promise<Buffer> {
    const cmd = Buffer.from('r');
    const canID = Buffer.from([0x00]);
    const table = Buffer.from([0x07]);
    const offset = Buffer.from([0x00, 0x00]);
    const sizeParam = Buffer.from([0x00, 0xd4]); // 212 bytes (full data set)
    const req = Buffer.concat([cmd, canID, table, offset, sizeParam]);
    return await this.send(req);
  }

  public async testCommunication(): Promise<Buffer> {
    const cmd = Buffer.from('c');
    return await this.send(cmd);
  }

  protected async send(data: Buffer): Promise<Buffer> {
    if (!this.ready()) {
      return Promise.reject('Serial connection not ready');
    }

    const sizeBuf = Buffer.alloc(2);
    sizeBuf.writeUInt16BE(data.length, 0);

    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(data), 0);

    const frame = Buffer.concat([sizeBuf, data, crcBuf]);
    log.verbose('MSSerial', 'sending frame %j', frame.toString('hex'));
    return new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject = reject;
      this.timeout = setTimeout(() => {
        this.responseReject = null;
        this.responseResolve = null;
        this.parser.reset();
        reject('No response from ECU');
      }, 150);
      this.serial.write(frame, err => {
        if (err != null) {
          log.error('MSSerial', err);
          reject(err);
        }
        if (this.mock) {
          setTimeout(() => {
            const idx = Math.floor(Math.random() * mockResponses.length)
            this.receiveFrame(Buffer.from(mockResponses[idx], 'hex'));
          }, 10);
        }
      })
    });
  }

  static async tryConnect(portName: string): Promise<MSSerial> {
    return new Promise((resolve, reject) => {
      const serial = new MSSerial(portName);
      setTimeout(() => {
        serial.fetchRealtimeData().then(_ => {
          resolve(serial);
        }).catch(() => {
          serial.serial.binding.close();
          reject();
        })
      }, 500);
    });
  }

  static async autodetect(): Promise<MSSerial> {
    const ports = await SerialPort.list();
    for (const port of ports) {
      log.info('MSSerial', 'Trying port ' + port.comName);
      try {
        const connection = await MSSerial.tryConnect(port.comName);
        log.info('MSSerial', 'Response from ' + port.comName);
        return connection;
      } catch (err) {
        log.info('MSSerial', 'Port failed ' + port.comName);
      }
    }
    throw new Error('Unable to auto-detect ECU serial port');
  }
}
