import * as ini from 'ini';
import * as fs from 'fs';
import log from '../logger';
import { sprintf } from 'voca';

export interface LogEntryConfig {
  outputChannelName: string,
  fieldName: string,
  fieldType: 'int' | 'float',
  formatter: (outputChannelValue: number) => string
}

export interface OutputChannelConfig {
  name: string,
  extractor: (Buffer) => number,
  unit: string,
}

export default class MSDecoder {

  // TODO read this from the ECU
  engineParams = {
    reqFuel: 2.5,
    stoich: 14.7,
    nCylinders: 4,
    nSquirts1: 2,
    nSquirts2: 2,
    "0": 0,
    "110": 110,
  };

  ignoreKeys = [
    'ochBlockSize',
    'ochGetCommand',
    'lambda1', // not logged afr1
    'lambda2', // not logged afr2
    ''
  ];

  config: { [key: string]: any };

  constructor(configFilePath: string) {

    if (!fs.existsSync(configFilePath)) {
      throw new Error('Config file does not exist');
    }

    log.verbose('MSDecoder', 'Config file %j exists, attempting to parse', configFilePath);
    this.config = ini.parse(fs.readFileSync(configFilePath, 'utf-8'));
  }

  getOutputChannelConfigs(): { [key: string]: OutputChannelConfig } {
    const configs = {};
    Object.keys(this.config['OutputChannels'])
      .map(key => {
        const channelConfig = this.getOutputChannelConfig(key);
        if (channelConfig != null) {
          configs[key] = channelConfig;
        }
      });
    return configs;
  }

  getOutputChannelKeys(): Array<string> {
    return Object.keys(this.config['OutputChannels'])
  }

  getOutputChannelConfig(key: string): OutputChannelConfig | null {
    const channelConfigStr = this.config['OutputChannels'][key];
    const outputChannelConfig = {
      name: key,
      extractor: (buf: Buffer) => 0, // default extractor just returns 0
      unit: "" // no unit string
    }

    if (this.ignoreKeys.indexOf(key) >= 0) {
      return null;
    }

    if (key === 'time') {
      // has special handlingn in the datalogger
      // just return the default config
      return outputChannelConfig;
    }

    if (channelConfigStr == null) {
      log.error('MSDecoder', 'Requested output channel key not present', key);
      return outputChannelConfig;
    }

    const channelConfigFields = channelConfigStr
      .replace(/\{.*bitStringValue\(.*algorithmUnits.*\}/, 'kPa') // feel free to make this not shit
      .split(',')
      .map(v => v.trim());

    if (channelConfigFields[0] === 'scalar' && channelConfigFields.length === 6) {
      outputChannelConfig.unit = (channelConfigFields[3] || "").replace(/\"/g, '');
      // first byte is a flag field
      const offset = parseInt(channelConfigFields[2], 10) + 1;
      const multiplier = parseFloat(channelConfigFields[4]);
      const scale = parseInt(channelConfigFields[5], 10);
      const packing = channelConfigFields[1];

      outputChannelConfig.extractor = (buf: Buffer): number => {
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
      return outputChannelConfig;
    }

    if (channelConfigFields[0] === 'bits' && channelConfigFields.length === 4) {
      const packing = channelConfigFields[1];
      const offset = parseInt(channelConfigFields[2], 10) + 1;
      const bitOffsetRange = channelConfigFields[3].substr(1, 3).split(':');
      if (bitOffsetRange[0] !== bitOffsetRange[1] || packing !== 'U08') {
        log.warn(
          'Cannot handle bit ranges or non U08 packing, key: ',
          key
        );
        return outputChannelConfig;
      }

      // bit offset from MSB
      const bitOffset = parseInt(bitOffsetRange[0], 10);
      outputChannelConfig.extractor = (buf: Buffer): number => {
        const byte = buf.readUInt8(offset);
        return (byte >> (8 - bitOffset)) & 1;
      }
      return outputChannelConfig;
    }

    if (channelConfigFields.length === 2 || channelConfigFields.length === 1) {
      // this might be an alias field
      const match = channelConfigFields[0].match(/\{ (\w+) \}/);
      if (match) {
        const aliasOf = match[1];
        if (aliasOf in this.config['OutputChannels']) {
          return this.getOutputChannelConfig(aliasOf);
        } else if (aliasOf in this.engineParams) {
          outputChannelConfig.extractor = (buf: Buffer) => this.engineParams[aliasOf];
        } else {
          log.warn('MSDecoder', 'Cannot resolve field alias', aliasOf);
        }
        outputChannelConfig.unit = (channelConfigFields[1] || "").replace(/\"/g, '');
        return outputChannelConfig;
      }
    }
    log.warn(
      'MSDecoder',
      'Error parsing output channel',
      key,
      channelConfigStr
    );
    return outputChannelConfig;
  }

  getLogEntryConfig(): Array<LogEntryConfig> {
    return this.config['Datalog'].entry
      .map(
        entry => {
          const values = entry.split(',').map(v => v.trim().replace(/\"/g, ''));
          // when the length is 5 it means there's a condition attached
          // let's just assume true for these conditions and log everything
          if (values.length !== 4 && values.length !== 5) {
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
