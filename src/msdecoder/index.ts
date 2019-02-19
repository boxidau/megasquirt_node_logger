import * as ini from 'ini';
import * as fs from 'fs';
import log from '../logger';
import * as invariant from 'invariant';
import {sprintf} from 'voca';

export interface LogEntryConfig {
  outputChannelName: string,
  fieldName: string,
  fieldType: 'int'|'float',
  formatter: (outputChannelValue: number) => string
}

export interface OutputChannelConfig {
  name: string,
  extractor: (Buffer) => number,
  unit: string,
}

export default class MSDecoder {

  config: {[key: string]: any};

  constructor(configFilePath: string) {

    if (!fs.existsSync(configFilePath)) {
      throw new Error('Config file does not exist');
    }

    log.verbose('MSDecoder', 'Config file %j exists, attempting to parse', configFilePath);
    this.config = ini.parse(fs.readFileSync(configFilePath, 'utf-8'));
  }

  getOutputChannelConfig(): {[key: string]: OutputChannelConfig} {
    const config = {};
    Object.keys(this.config['OutputChannels'])
      .map(key => {
        const channelConfig = this.config['OutputChannels'][key]
          .split(',')
          .map(v => v.trim());
        config[key] = {
          name: key,
          extractor: this.getOutputChannelExtractor(key),
          unit: (channelConfig[3] || "").replace(/\"/g, '')
        }
      });
    return config;
  }

  getOutputChannelKeys(): Array<string> {
    return Object.keys(this.config['OutputChannels'])
  }

  getOutputChannelExtractor(key: string): (Buffer) => any {
    const channelConfig = this.config['OutputChannels'][key]
      .split(',')
      .map(v => v.trim());
    if (channelConfig[0] === 'scalar' && channelConfig.length === 6) {
      // first byte is a flag field
      const offset = parseInt(channelConfig[2], 10) + 1;
      const unit = channelConfig[3];
      const multiplier = parseFloat(channelConfig[4]);
      const scale = parseInt(channelConfig[5], 10);
      const packing = channelConfig[1];

      return (buf: Buffer): number => {
        let extractedValue = 0;
        switch (packing) {
          case 'S32':
            extractedValue = buf.readInt32BE(offset);
            break;
          case 'S16':
            extractedValue = buf.readInt16BE(offset);
            break;
          case 'S08':
            extractedValue = buf.readInt8(offset);
            break;
          case 'U32':
            extractedValue = buf.readUInt32BE(offset);
            break;
          case 'U16':
            extractedValue = buf.readUInt16BE(offset);
            break;
          case 'U08':
            extractedValue = buf.readUInt8(offset);
            break;
          default:
            log.warn('Not sure how to handle %j', packing);
        }
        // who in their right fucking mind would add before multiplying
        return (extractedValue + scale) * multiplier;
      }
    }
    if (channelConfig[0] === 'bits' && channelConfig.length === 4) {
      const packing = channelConfig[1];
      const offset = parseInt(channelConfig[2], 10) + 1;
      const bitOffsetRange = channelConfig[3].substr(1,3).split(':');
      if (
        bitOffsetRange[0] !== bitOffsetRange[1]
        || packing !== 'U08'
      ) {
        log.warn(
          'Cannot handle bit ranges or non U08 packing, key: ',
          key
        );
        return (buf: Buffer) => 0;
      }

      // bit offset from MSB
      const bitOffset = parseInt(bitOffsetRange[0], 10);
      return (buf: Buffer): number => {
        const byte = buf.readUInt8(offset);
        return (byte >> (8 - bitOffset)) & 1;
      }
    }
    return (buf: Buffer) => {
      log.warn(
        'Unknown packing/encoding', key, channelConfig);
      return 0;
    }
  }

  getLogEntryConfig(): Array<LogEntryConfig> {
    return this.config['Datalog'].entry
      .map(
        entry => {
          const values = entry.split(',').map(v => v.trim().replace(/\"/g, ''));
          if (values.length !== 4) {
            log.error('MSDecoder', "Error parsing Datalog section entry", entry);
            return null;
          }
          return {
            outputChannelName: values[0],
            fieldName: values[1],
            fieldType: values[2],
            formatter: (channelValue: number) => {
              return sprintf(values[3], channelValue)
            }
          }
        }
      ).filter(entry => entry !== null);
  }

}
