import { Transform, TransformCallback } from 'stream';

export default class FrameParser extends Transform {

    private buffer: Buffer;

    constructor(options = {}) {
        super(options)
        this.buffer = Buffer.alloc(0);
    }

    _transform(chunk: Buffer, encoding: string, cb: TransformCallback) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length >= 2) {
            const dataSize = this.buffer.readUInt16BE(0);
            const frameLength = dataSize + 6;
            if (frameLength <= this.buffer.length) {
                this.emitFrame(frameLength);
            }
        }
        cb();
    }

    emitFrame(bytes: number) {
        const frame = this.buffer.slice(0, bytes);
        this.push(frame);
        this.buffer = this.buffer.slice(bytes);
    }

    _flush(cb: TransformCallback) {
        // try to prevent corruption by not nessing up the internal buffer state
        this.push(Buffer.alloc(0));
        cb();
    }
}
