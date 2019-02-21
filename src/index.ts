#!/usr/bin/env node

import * as commander from 'commander';
import MSSerial from './msserial';
import MSDecoder from './msdecoder';
import MSDataLogger from './msdatalogger';
import * as invariant from 'invariant';
import WebsocketStreamer from './datahandlers/websocket';
import MockDataProducer from './mockdataproducer'

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
    'milliseconds between data fetch cycles. defaults to 100',
    v => parseInt(v, 10),
    100
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
    '-w, --websocket-port <n>', 'Websocket broadcast port, specify to enable',
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
let datalogger = null;
if (commander.fakeData != null) {
  datalogger = new MockDataProducer(commander.pollInterval);
} else {
  const serial = new MSSerial(
    commander.serialPort, commander.baudRate, commander.mockSerial);

  const loggerOptions = {
    pollInterval: commander.pollInterval,
    logDir: commander.logDir,
    loggingEnabled: commander.log,
  }

  datalogger = new MSDataLogger(
    serial,
    decoder,
    loggerOptions
  );
}

if (commander.websocketPort != null) {
  const websocketStreamer = new WebsocketStreamer(commander.websocketPort);
  datalogger.registerDataCallback(websocketStreamer.broadcastData);
}

datalogger.start();
