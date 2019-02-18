import * as SerialPort from 'serialport';
import * as InterByteTimeout from '@serialport/parser-inter-byte-timeout';
import { crc32 } from 'crc';
import * as invariant from 'invariant';
import MSConfig from '../msconfig';
import log from '../logger';

interface ReadDataResponse {
  rpm: number
}

export default class MSSerial {
  serial: SerialPort;
  parser: any;
  registeredHandler: (Buffer) => void | null;

  constructor(portName: string, baudRate: number = 115200) {
    this.serial = new SerialPort(portName, {baudRate});
    this.parser = this.serial.pipe(
      new InterByteTimeout({interval: 50})
    );
    this.parser.on('data', this.handleData);
  }

  public handleData(frame: Buffer): void {
    const dataSize = frame.readUInt16BE(0);
    // frame starts with length (2 bytes) and ends with CRC32 (4 bytes)
    invariant(dataSize + 6 === frame.length, 'Invalid data size in response data');

    const data = frame.slice(2, dataSize + 2);
    const frameCRC = frame.readUInt32BE(frame.length - 4);
    const calculatedCRC = crc32(data);
    invariant(frameCRC === calculatedCRC, "Invalid checksum");

    if (this.registeredHandler) {
      this.registeredHandler(data);
    }

    log.verbose('MSSerial', 'received frame %j', frame.toString('hex'));
    console.log(frame);
  }

  public async fetchData(): Promise<boolean> {
    const cmd = Buffer.from('r');
    const canID = Buffer.from([0x00]);
    const table = Buffer.from([0x07]);
    const offset = Buffer.from([0x00, 0x00]);
    const sizeParam = Buffer.from([0x00, 0x51]);
    const req = Buffer.concat([cmd, canID, table, offset, sizeParam]);
    const ok = await this.send(req);
    log.info(ok);
    return true;
  }

  public async testCommunication(): Promise<boolean> {
    const cmd = Buffer.from('c');
    await this.send(cmd);
    return true;
  }

  protected async send(data: Buffer): Promise<void> {
    const sizeBuf = Buffer.alloc(2);
    sizeBuf.writeUInt16BE(data.length, 0);

    const crc: number = crc32(data);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc, 0);

    const frame = Buffer.concat([sizeBuf, data, crcBuf]);
    log.verbose('MSSerial', 'sending frame %j', frame.toString('hex'));
    return new Promise((resolve, reject) => {
      this.serial.write(frame, err => {
        if (err != null) {
          log.error('MSSerial', err);
          reject();
        } else {
          resolve();
        }
      })
    });

  }

  public testData(): Buffer {
    const frame = Buffer.from([
      0x00, 0x52, 0x00, 0x00, 0x62, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x93,
      0x93, 0x01, 0x01, 0x03, 0xe2, 0x03, 0xe1, 0x02,
      0x79, 0x02, 0xf6, 0x00, 0x00, 0x00, 0x74, 0x00,
      0x65, 0x00, 0x65, 0x00, 0x00, 0x03, 0xe8, 0x03,
      0xe8, 0x03, 0xf1, 0x00, 0x64, 0x00, 0x00, 0x00,
      0x64, 0x03, 0xe8, 0x00, 0x64, 0x00, 0x64, 0x00,
      0x64, 0x00, 0x8e, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x35, 0x00, 0x00, 0x03, 0xe2, 0x00,
      0x64, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x6d, 0x61, 0x90, 0xf6
    ]);
    const dataSize = frame.readUInt16BE(0);
    // frame starts with length (2 bytes) and ends with CRC32 (4 bytes)
    invariant(dataSize + 6 === frame.length, 'Invalid data size in response data');
    const data = frame.slice(2, dataSize + 2);
    const frameCRC = frame.readUInt32BE(2 + dataSize);
    const calculatedCRC = crc32(data);
    invariant(frameCRC === calculatedCRC, "Invalid checksum");
    return data;
  }


}
