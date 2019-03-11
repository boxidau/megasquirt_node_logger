# Megasquirt Node Logger

This project is intended to be a serial data logger reimplementation for megasquirt based projects.
My plan is to install this on a raspberry pi running a wpe buildroot (fast boot time a handful of seconds)
The buildroot contains a webkit browser and can display a gauge cluster built in react.

## Features

- Parses megasquirt ini files (reasonably well) to enable customized field logging
- Pluggable architecture enabling single input multiple output of megasquirt data. Current outputs:
  - Log to file (msl format - works with MegalogViewer)
  - Websocket streaming (for another project i'm working on for react based gauge cluster)

## TODO

- Automatically start new log file on disconnect/reconnect
- Consider doing a better job at parsing the insanity that is the MS ini files (maybe)
- Better/more error handling

### Installation
If you don't have yarn you can use npm I guess
- `yarn install`

### Configuration (optional)
- Requires: cpp to parse the macros in the MS ini files
- Copy your ini file to the config directory
- `cd config`
- Run `./preprocess_config.sh <config_file_name> mainController.ini`
- This will enable celsius mode, edit preprocess_config.sh if you don't want this, it's a very basic script

## Usage
- Basic: `yarn start -s <serial_port>`
- With websocket server on port 8088: `yarn start -s <serial_port>`

```
yarn start --help

Usage: index [options]

Options:
  -s, --serial-port <file>   Serial port Megasquirt is connected to
  -i, --ini-file <file>      INI file from MegaTune project (default: "./config/mainController.ini")
  -b, --baud-rate            Serial baud rate. defaults to 115200
  -m, --mock-serial          Enables mock serial mode
  -l, --log-dir <directory>  Directory in which to create log files. defaults to ./dataLogs (default: "./dataLogs")
  -n, --no-log               Disable data logging
  -w, --websocket-port <n>   Websocket broadcast port. defaults to 8088 (default: 8088)
  -f, --fake-data            Emit fake data
  -h, --help                 output usage information

```
