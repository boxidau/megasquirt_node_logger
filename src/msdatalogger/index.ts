import MSSerial from '../msserial';
import MSConfig from '../msconfig';
import log from '../logger';

interface LoggerOptions {
  pollInterval: number,
}

export default class MSDataLogger {
  timer: NodeJS.Timer | null;
  options: LoggerOptions;
  serial: MSSerial;
  fieldParser: {[key: string]: (Buffer) => any};

  constructor(serial: MSSerial, config: MSConfig, options: LoggerOptions) {
    log.info('Starting logger');
    this.options = options;
    this.serial = serial;
    this.fieldParser = config.getOutputChannelBufferParser();
  }

  public start(): NodeJS.Timer {
    this.timer = setInterval(this.executeLog, this.options.pollInterval);
    this.timer.ref();
    return this.timer;
  }

  public stop(): void {
    this.timer.unref();
  }

  executeLog = (): void => {
    this.serial.fetchRealtimeData()
      .then((response: Buffer) => {
        const responseData = {};
        Object.keys(this.fieldParser).map(key => {
          responseData[key] = this.fieldParser[key](response);
        })
        console.log(responseData);
      });
    const test = Buffer.from('00d5000049000000000000000000009393010103e803ca035d03f30000007600650065000003e803e803cb00640000006403e800640064006400890000000000000035000003ca006400000064000000000000000001f80000007d000003ca000000000000000000000000000000000000000000000000000000000000000000000000000103ff0000000000640000000000000000000000000000000000000000000003ca03ca00000000000000000000035d000000000000000000000000000000000000000000000000000000000000c304040000005d995e6c', 'hex');
    this.serial.receiveFrame(test);
  }
}
