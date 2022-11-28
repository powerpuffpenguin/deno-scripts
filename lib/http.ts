// deno-lint-ignore-file no-explicit-any
import { Defer } from "../deps/easyts/core/defer.ts";
import { Exception } from "../deps/easyts/core/exception.ts";
import { DateTime } from "../deps/luxon/luxon.js";
import { readFull } from "./io.ts";

function throwResponse(resp: Response, opts?: {
  text?: boolean;
}): never | Promise<never> {
  if (opts?.text) {
    return resp.text().then((text) => {
      throw new Exception(`${resp.status} ${resp.statusText} ${text}`);
    });
  }
  throw new Exception(`${resp.status} ${resp.statusText}`);
}
async function statMTime(path: string): Promise<DateTime | undefined> {
  try {
    const stat = await Deno.stat(path);
    const mtime = stat.mtime;
    if (mtime) {
      return DateTime.fromMillis(mtime.getTime());
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) {
      throw e;
    }
  }
  return;
}
interface Metadata {
  lastModified?: DateTime;
  length: number;
}
async function readMetdata(name: string, r: Deno.FsFile, output?: {
  len?: number;
}): Promise<Metadata> {
  let b = new Uint8Array(2);
  await readFull(r, b);
  const size = new DataView(b.buffer).getUint16(0);
  b = new Uint8Array(size);
  if (output?.len !== undefined) {
    output.len = size + 2;
  }
  await readFull(r, b);
  const text = new TextDecoder().decode(b);
  const md = JSON.parse(text);
  const m = md["m"];
  if (typeof m !== "number") {
    throw new Exception(`unknow medatata of ${name}: ${text}`);
  }
  const l = md["l"];
  if (typeof l !== "number") {
    throw new Exception(`unknow medatata of ${name}: ${text}`);
  }
  let dt: DateTime | undefined;
  if (m != 0) {
    dt = DateTime.fromSeconds(m);
    if (!dt.isValid) {
      dt = undefined;
    }
  }
  return {
    length: l,
    lastModified: dt,
  };
}
function copyToDst(dst: string, r: Deno.FsFile, unix?: number) {
  return Defer.async(async (d) => {
    const rc = d.defer(() => r?.close());

    const path = dst + ".ok";
    const ok = await Deno.open(path, {
      write: true,
      truncate: true,
      create: true,
      mode: 0o664,
    });
    const okc = d.defer(() => ok.close());
    rc.cancel();
    await r.readable.pipeTo(ok.writable, {
      preventClose: true,
    });

    okc.cancel();
    ok.close();
    if (unix !== undefined && !isNaN(unix)) {
      await Deno.utime(path, 0, unix);
    }
    await Deno.rename(path, dst);
  });
}
class TemporaryFile {
  constructor(
    public readonly path: string,
    public readonly lastModified: DateTime | undefined,
    public readonly length: number,
  ) {
  }
  async write(body: ReadableStream<Uint8Array>) {
    let f: Deno.FsFile | undefined;
    try {
      f = await Deno.open(this.path, {
        write: true,
        truncate: true,
        create: true,
        mode: 0o664,
      });
      const md = new TextEncoder().encode(JSON.stringify({
        l: this.length,
        m: this.lastModified?.toUnixInteger() ?? 0,
      }));
      const size = new ArrayBuffer(2);
      new DataView(size).setUint16(0, md.length);
      await f.write(new Uint8Array(size));
      await f.write(md);

      await body.pipeTo(f.writable, {
        preventClose: true,
      });
    } finally {
      f?.close();
    }
  }
  async dst(dst: string) {
    const r: Deno.FsFile | undefined = await Deno.open(this.path);
    let unix: number | undefined;
    try {
      const md = await readMetdata(this.path, r);
      if (md.lastModified?.isValid) {
        unix = md.lastModified.toUnixInteger();
      }
    } catch (e) {
      r.close();
      throw e;
    }

    await copyToDst(dst, r, unix);
    await Deno.remove(this.path);
  }
}

class Record {
  async dst(dst: string) {
    const r = this.f;
    await r.seek(this.header, Deno.SeekMode.Start);
    this.clsoed_ = true;
    let unix: undefined | number;
    const m = this.md.lastModified;
    if (m?.isValid ?? false) {
      unix = m?.toUnixInteger();
    }
    await copyToDst(dst, r, unix);
    await Deno.remove(this.path);
  }
  static async load(path: string): Promise<Record | undefined> {
    let f: Deno.FsFile | undefined;
    try {
      f = await Deno.open(path, {
        read: true,
        write: true,
      });
      const output = {
        len: 0,
      };
      const md = await readMetdata(path, f, output);
      const fs = f;
      f = undefined;
      return new Record(
        path,
        md,
        output.len,
        fs,
      );
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    } finally {
      f?.close();
    }
  }
  constructor(
    public readonly path: string,
    public md: Metadata,
    public readonly header: number,
    public readonly f: Deno.FsFile,
  ) {}
  private clsoed_ = false;
  close() {
    if (this.clsoed_) {
      return;
    }
    this.clsoed_ = true;
    this.f.close();
  }
}
class Downloader {
  private logger: Logger;
  public readonly temp: string;
  constructor(
    public readonly path: string,
    public readonly url: string,
    public readonly headers?: HeadersInit,
    logger?: Logger,
  ) {
    this.temp = path + `.denodwonload`;
    this.logger = logger ?? console;
  }
  async serve(): Promise<void> {
    const pm = await statMTime(this.path);
    const record = await Record.load(this.temp);
    try {
      if (pm === undefined) { // 目標檔案不存在
        if (record?.md?.lastModified?.isValid ?? false) {
          // 恢復下載
          await this._recover(record!);
          return;
        }

        // 新建下載檔案
        return this._new();
      } else {
        if (record === undefined) {
          // 刷新檔案
          return this._refash(pm.toHTTP());
        } else {
          if (record.md.lastModified?.isValid ?? false) {
            if (record.md.lastModified! > pm) {
              // 恢復下載
              await this._recover(record);
              return;
            }
          }
          // 記錄無效 刷新檔案
          record.close();
          await Deno.remove(this.temp);
          return this._refash(pm.toHTTP());
        }
      }
    } finally {
      record?.close();
    }
  }
  private _request(): Request {
    const req = new Request(this.url, {
      method: "GET",
      headers: this.headers,
    });
    return req;
  }
  private async _refash(lastModified: string): Promise<void> {
    this.logger.debug(
      `refash request ${lastModified}: ${this.url}`,
    );
    const req = this._request();
    req.headers.set("If-Modified-Since", lastModified);
    const resp = await fetch(req);
    switch (resp.status) {
      case 304:
        // 檔案沒有變化
        this.logger.debug(
          `refash 304 Not Modified`,
        );
        return;
      case 200:
        // 檔案已更新
        this.logger.warn(
          `refash 200`,
        );
        return this._new();
    }
    this.logger.error(
      `new request error: ${resp.status} ${resp.statusText}`,
    );
    await throwResponse(resp, { text: true });
  }
  private async _new(resp?: Response): Promise<void> {
    if (!resp) {
      this.logger.debug("new request:", this.url);
      resp = await fetch(this._request());
    }
    if (resp.status != 200) {
      this.logger.error(
        `new request error: ${resp.status} ${resp.statusText}`,
      );
      await throwResponse(resp, { text: true });
    }
    const body = resp.body;
    if (!body) {
      throw new Exception("body null");
    }
    const str = resp.headers.get("Last-Modified");
    const contextLength = resp.headers.get("content-length");
    const length = parseInt(contextLength ?? "0");
    if (!isFinite(length)) {
      throw new Exception(`context-length not supported: ${contextLength}`);
    }
    let lastModified: DateTime | undefined;
    if (str !== null) {
      lastModified = DateTime.fromHTTP(str);
    }
    // 寫入臨時檔案
    this.logger.debug(
      `write temp: length=${length} modified=${str} path=${this.temp}`,
    );
    const temp = new TemporaryFile(this.temp, lastModified, length);
    await temp.write(body);

    // 輸出到目標檔案
    await temp.dst(this.path);
  }
  private async _recover(record: Record): Promise<void> {
    const md = record.md;
    const lastModified = md.lastModified!;

    const begin = (await record.f.seek(0, Deno.SeekMode.End)) - record.header;

    if (begin == md.length) {
      // 已完成所有數據下載，檢查服務器是否有更新
      return this._recoverRefash(record);
    }

    this.logger.debug(
      `recover request range(${begin},${md.length}): ${this.url}`,
    );
    const req = this._request();
    req.headers.set(
      "If-Range",
      lastModified.toHTTP(),
    );
    req.headers.set("Range", `bytes=${begin}-`);
    const resp = await fetch(req);
    switch (resp.status) {
      case 200:
        this.logger.warn("recover 200");
        return this._new(resp);
      case 416:
        //  範圍錯誤,可能是服務器檔案已更新 或本地數據損毀，重新下載
        this.logger.warn("recover 416 Range Not Satisfiable");
        return this._new();
      case 206:
        this.logger.debug("recover 206 Partial Content");
        return this._partialContent(record, resp);
    }
    this.logger.error(
      `recover error: ${resp.status} ${resp.statusText}`,
    );
    await throwResponse(resp, { text: true });
  }
  private async _partialContent(record: Record, resp: Response) {
    const body = resp.body;
    if (!body) {
      throw new Exception("body null");
    }
    await record.f.seek(0, Deno.SeekMode.End);
    for await (const b of body) {
      await record.f.write(b);
    }
    await record.dst(this.path);
  }
  private async _recoverRefash(record: Record): Promise<void> {
    const lastModified = record.md.lastModified!.toHTTP();
    this.logger.debug(
      `recover refash(${record.md.length},${lastModified}): ${this.url}`,
    );

    const req = this._request();
    req.headers.set(
      "If-Modified-Since",
      lastModified,
    );

    const resp = await fetch(req);
    switch (resp.status) {
      case 304: //下載完成，輸出到目標路徑
        this.logger.debug("recover refash 304");
        return record.dst(this.path);
      case 200: // 服務器已經更新，重新下載
        this.logger.warn("recover refash 200");
        return this._new(resp);
    }
    this.logger.error(
      `recover refash error: ${resp.status} ${resp.statusText}`,
    );
    await throwResponse(resp, { text: true });
  }
}
export interface Logger {
  debug(...data: any[]): void;
  info(...data: any[]): void;
  warn(...data: any[]): void;
  error(...data: any[]): void;
}

/**
 * 下載一個檔案
 * @param path 本地檔案路徑
 * @param url 要下載的 url
 */
export function download(
  path: string,
  url: string,
  headers?: HeadersInit,
  logger?: Logger,
): Promise<void> {
  return new Downloader(path, url, headers, logger).serve();
}
