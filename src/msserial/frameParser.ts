import { Transform, TransformCallback } from 'stream';
import { timingSafeEqual } from 'crypto';

export default class FrameParser extends Transform {

    private buffer: Buffer;

    constructor(options = {}) {
        super(options)
        this.buffer = Buffer.alloc(0);
    }

    _transform(chunk: Buffer, encoding: string, cb: TransformCallback): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length > 5000) {
            this.buffer = chunk;
        }
        if (this.buffer.length >= 2) {
            const dataSize = this.buffer.readUInt16BE(0);
            const frameLength = dataSize + 6;
            if (frameLength <= this.buffer.length) {
                this.emitFrame(frameLength);
            }
        }
        cb();
    }

    reset(): void {
        this.buffer = Buffer.alloc(0);
    }

    emitFrame(bytes: number): void {
        const frame = this.buffer.slice(0, bytes);
        this.push(frame);
        this.buffer = this.buffer.slice(bytes);
    }

    _flush(cb: TransformCallback): void {
        // try to prevent corruption by not nessing up the internal buffer state
        this.push(Buffer.alloc(0));
        cb();
    }
}
