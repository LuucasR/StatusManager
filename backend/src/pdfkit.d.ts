declare module "pdfkit" {
  import { Readable } from "node:stream";

  export default class PDFDocument extends Readable {
    constructor(options?: { margin?: number; size?: string });
    pipe<T extends NodeJS.WritableStream>(destination: T): T;
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string): this;
    moveDown(lines?: number): this;
    end(): void;
  }
}
