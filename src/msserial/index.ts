import * as SerialPort from 'serialport';
import * as MockBinding from '@serialport/binding-mock';
import FrameParser from './frameParser';
import { crc32 } from 'crc';
import log from '../logger';
import mockResponses from './mockResponses';

export default class MSSerial {
  serial: SerialPort;
  parser: any;
  private responseResolve: (buffer: Buffer) => void | null;
  private responseReject: (error: Error) => void | null;
  private timeout: NodeJS.Timer | null;
  mock: boolean = false;

  constructor(portName: string, baudRate: number = 115200, mock: boolean = false) {
    const options = { baudRate };
    if (mock) {
      this.mock = true;
      portName = '/dev/ROBOT';
      MockBinding.createPort(portName, { echo: false, record: false });
      options['binding'] = MockBinding;
    }
    this.serial = new SerialPort(portName, options);
    this.parser = this.serial.pipe(new FrameParser());
    this.parser.on('data', this.receiveFrame);
  }

  public receiveFrame = (frame: Buffer): void => {
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
        reject(new Error('Timeout'));
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
}
