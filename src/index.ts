#!/usr/bin/env node

import * as commander from 'commander';
import MSSerial from './msserial';
import MSConfig from './msconfig';
import * as invariant from 'invariant';

commander
  .option(
    '-s, --serial-port <file>',
    'Serial port Megasquirt is connected to'
  )
  .option(
    '-i, --ini-file <file>',
    'INI file from MegaTune project',
    './config/mainController.ini'
  )
  .option(
    '-r, --fetch-rate <n>',
    'milliseconds between data fetch cycles. defaults to 20',
    v => parseInt(v, 10),
    20
  )
  .parse(process.argv);

invariant(
  commander.serialPort != null,
  "You must specify a serial port with -s/--serial-port"
);

const config = new MSConfig(commander.iniFile);
const comms = new MSSerial(commander.serialPort);
comms.fetchData();
comms.handleData(Buffer.from('0052000010000000000000000000009393010103e803b803f604c40000007700650065000003e803e803ba00640000006403e8006400640064008400000000ffe30035000003b900640000006400000000000000526b8170', 'hex'))
