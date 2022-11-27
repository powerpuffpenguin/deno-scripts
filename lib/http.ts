import { Defer } from "../deps/easyts/core/defer.ts";
import { Exception } from "../deps/easyts/core/exception.ts";
import { DateTime } from "../deps/luxon/luxon.js";
import { copy, readFull } from "./io.ts";

async function lastModified(path: string): Promise<DateTime | undefined> {
  try {
    const stat = await Deno.stat(path);
    if (stat.mtime) {
      return new DateTime(stat.mtime);
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
  length: bigint;
}
class TemporaryFile {
  constructor(
    public readonly path: string,
    public readonly lastModified: DateTime | undefined,
    public readonly length: bigint,
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
        l: this.length.toString(),
        m: this.lastModified?.toISO() ?? "",
      }));
      const size = new ArrayBuffer(2);
      new DataView(size).setUint16(0, md.length);
      await f.write(new Uint8Array(size));
      await f.write(md);

      for await (const b of body) {
        await f.write(b);
      }
    } finally {
      if (f) {
        await f.close();
      }
    }
  }
  dst(dst: string) {
    return Defer.async(async (d) => {
      const r: Deno.FsFile | undefined = await Deno.open(this.path);
      const rc = d.defer(() => r?.close());
      await this._read(r);

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
      await Deno.rename(path, dst);

      await Deno.remove(this.path);
    });
  }
  private async _read(r: Deno.FsFile): Promise<Metadata> {
    let b = new Uint8Array(2);
    await readFull(r, b);
    const size = new DataView(b.buffer).getUint16(0);
    b = new Uint8Array(size);
    await readFull(r, b);
    const text = new TextDecoder().decode(b);
    const md = JSON.parse(text);
    const m = md["m"];
    if (typeof m !== "string") {
      throw new Exception(`unknow medatata: ${text}`);
    }
    const l = md["l"];
    if (typeof l !== "string") {
      throw new Exception(`unknow medatata: ${text}`);
    }
    let dt: DateTime | undefined;
    if (m != "") {
      dt = DateTime.fromISO(m);
      if (!dt.isValid) {
        dt = undefined;
      }
    }
    return {
      length: BigInt(l),
      lastModified: dt,
    };
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
    const pLast = await lastModified(this.path);
    // console.log("-------", pLast);
    return this._new();
  }
  //   async _serve(): Promise<void> {
  //     const pLast = await lastModified(this.path);
  //     const tLast = await lastModified(this.temp);
  //     if (pLast === undefined) {
  //       if (tLast === undefined) {
  //         // 新的下載
  //         return this._new();
  //       }
  //       // 恢復下載
  //       return this._recover(tLast);
  //     } else {
  //       if (tLast === undefined) {
  //         // 檔案已經存在 更新
  //         return this._refash();
  //       }
  //      tLast.diff(pLast)
  //       if (tLast.getTime() < pLast.getTime()) {
  //         // 本地檔案比較新
  //         throw new Exception(
  //           `The local file is newer than the cache, please delete the cache or local file and try again. ${this.path}`,
  //         );
  //       } else {
  //         // 恢復下載
  //         return this._recover(tLast);
  //       }
  //     }
  //   }
  private _request(): Request {
    const req = new Request(this.url, {
      method: "GET",
      headers: this.headers,
    });
    return req;
  }
  private async _refash(): Promise<void> {}
  private async _new(): Promise<void> {
    this.logger.debug("new request:", this.url);
    const resp = await fetch(this._request());
    if (resp.status != 200) {
      const text = await resp.text();
      throw new Exception(`${resp.status} ${resp.statusText} ${text}`);
    }
    const body = resp.body;
    if (!body) {
      throw new Exception("body null");
    }
    const str = resp.headers.get("Last-Modified");
    const length = BigInt(resp.headers.get("content-length") ?? "0");
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
  private async _recover(last: Date): Promise<void> {}
}
export interface Logger {
  debug(...data: any[]): void;
  info(...data: any[]): void;
  log(...data: any[]): void;
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
