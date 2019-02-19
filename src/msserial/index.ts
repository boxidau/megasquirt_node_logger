import * as SerialPort from 'serialport';
import * as MockBinding from '@serialport/binding-mock';
import * as InterByteTimeout from '@serialport/parser-inter-byte-timeout';
import { crc32 } from 'crc';
import * as invariant from 'invariant';
import log from '../logger';

export default class MSSerial {
  serial: SerialPort;
  parser: any;
  responseResolver: (Buffer) => void | null;
  mock: boolean = false;

  constructor(portName: string, baudRate: number = 115200, mock: boolean = false) {
    const options = {baudRate};
    if (mock) {
      this.mock = true;
      portName = '/dev/ROBOT';
      MockBinding.createPort(portName, {echo: false, record: false});
      options['binding'] = MockBinding;
    }
    this.serial = new SerialPort(portName, options);
    this.parser = this.serial.pipe(
      new InterByteTimeout({interval: 50})
    );
    this.parser.on('data', this.receiveFrame);
  }

  public receiveFrame = (frame: Buffer): void => {
    log.verbose('MSSerial', 'received frame %j', frame.toString('hex'));
    const dataSize = frame.readUInt16BE(0);
    log.verbose('MSSerial', 'frame data size %j bytes', dataSize);
    // frame starts with length (2 bytes) and ends with CRC32 (4 bytes)
    invariant(dataSize + 6 === frame.length, 'Invalid data size in response data');

    const data = frame.slice(2, dataSize + 2);
    const frameCRC = frame.readUInt32BE(frame.length - 4);
    const calculatedCRC = crc32(data);
    invariant(frameCRC === calculatedCRC, "Invalid checksum");
    log.verbose('MSSerial', 'frame CRC OK');
    if (this.responseResolver) {
      this.responseResolver(data);
    } else {
      log.warn(
        'MSSerial',
        'No resolver registered, unexpected data frame from device?'
      );
    }
    console.log(frame);
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

    const crc: number = crc32(data);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);

    const frame = Buffer.concat([sizeBuf, data, crcBuf]);
    log.verbose('MSSerial', 'sending frame %j', frame.toString('hex'));
    return new Promise((resolve, reject) => {
      this.responseResolver = resolve;
      this.serial.write(frame, err => {
        if (err != null) {
          log.error('MSSerial', err);
          reject();
        }
      })
    });
  }
}
