import * as WebSocket from 'ws';
import { OutputChannelData } from '../msdataproducer';
import log from '../logger';

export default class WebsocketStreamer {

  server: WebSocket.Server;

  constructor(port: number = 8088) {
    log.info('WebsocketStreamer', 'Creating websocket server on port', port);
    this.server = new WebSocket.Server({ port });
    this.server.on('connection', (ws, req) => {
      log.info('WebsocketStreamer', 'New client', req.connection.remoteAddress);
    });
  }

  public broadcastData = (data: OutputChannelData): void => {
    const jsonData = JSON.stringify(data);
    this.server.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        log.verbose('WebsocketStreamer', 'Sending data to client', client);
        client.send(jsonData);
      }
    });
  }

}
