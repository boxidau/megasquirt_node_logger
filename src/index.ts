#!/usr/bin/env node

import * as commander from 'commander';
import MSSerial from './msserial';
import MSDecoder from './msdecoder';
import MSDataLogger from './msdatalogger';
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
    '-p, --poll-interval <n>',
    'milliseconds between data fetch cycles. defaults to 50',
    v => parseInt(v, 10),
    50
  )
  .option(
    '-b, --baud-rate', 'Serial baud rate. defaults to 115200',
    v => parseInt(v, 10),
    115200
  )
  .option(
    '-m, --mock-serial', 'Enables mock serial mode'
  )
  .parse(process.argv);

invariant(
  commander.serialPort != null || !commander.mockSerial,
  "You must specify a serial port with -s/--serial-port"
);

console.log(commander.iniFile)

const config = new MSDecoder(commander.iniFile);
const serial = new MSSerial(
  commander.serialPort, commander.baudRate, commander.mockSerial);

const datalogger = new MSDataLogger(
  serial,
  config,
  {pollInterval: commander.pollInterval}
);

datalogger.start();


serial.fetchRealtimeData().then(console.log);
//serial.receiveFrame(Buffer.from('00 52 00 00 10 00 00 00 00 00 00 00 00 00 00 93 93 01 01 03 e8 03b803f604c40000007700650065000003e803e803ba00640000006403e8006400640064008400000000ffe30035000003b900640000006400000000000000526b8170', 'hex'))
// const test =   Buffer.from('00d5000049000000000000000000009393010103e803ca035d03f30000007600650065000003e803e803cb00640000006403e800640064006400890000000000000035000003ca006400000064000000000000000001f80000007d000003ca000000000000000000000000000000000000000000000000000000000000000000000000000103ff0000000000640000000000000000000000000000000000000000000003ca03ca00000000000000000000035d000000000000000000000000000000000000000000000000000000000000c304040000005d995e6c', 'hex');
// console.log(test);
// serial.receiveFrame(test);
