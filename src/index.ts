#!/usr/bin/env node

import * as commander from 'commander';
import MSSerial from './msserial';
import MSDecoder from './msdecoder';
import MSDataProducer from './msdataproducer';
import * as invariant from 'invariant';
import WebsocketStreamer from './datahandlers/websocket';
import MockDataProducer from './mockdataproducer'
import LogFileWriter from './datahandlers/logfile';

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
    '-b, --baud-rate', 'Serial baud rate. defaults to 115200',
    v => parseInt(v, 10),
    115200
  )
  .option(
    '-m, --mock-serial', 'Enables mock serial mode'
  )
  .option(
    '-l, --log-dir <directory>', 'Directory in which to create log files. defaults to ./dataLogs',
    './dataLogs'
  )
  .option(
    '-n, --no-log', 'Disable data logging',
  )
  .option(
    '-w, --websocket-port <n>', 'Websocket broadcast port, specify to enable. defaults to 8088',
    v => parseInt(v, 10),
    8088
  )
  .option(
    '-f, --fake-data', 'Emit fake data'
  )
  .parse(process.argv);

invariant(
  commander.serialPort != null || !commander.mockSerial,
  "You must specify a serial port with -s/--serial-port"
);

const decoder = new MSDecoder(commander.iniFile);
let dataproducer = null;
if (commander.fakeData != null) {
  dataproducer = new MockDataProducer();
} else {
  const serial = new MSSerial(
    commander.serialPort, commander.baudRate, commander.mockSerial);
  dataproducer = new MSDataProducer(serial, decoder);
}

if (commander.log) {
  const logger = new LogFileWriter(decoder, commander.logDir);
  dataproducer.registerDataCallback(logger.writeDataToLog);
}

if (commander.websocketPort != null) {
  const websocketStreamer = new WebsocketStreamer(commander.websocketPort);
  dataproducer.registerDataCallback(websocketStreamer.broadcastData);
}

dataproducer.start();
