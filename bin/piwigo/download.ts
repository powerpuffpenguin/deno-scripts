import { Command } from "../../lib/flags.ts";
import * as log from "../../deps/std/log/mod.ts";
import { Client } from "./client.ts";
import { download } from "../../lib/http.ts";
export class ImageDownload {
  constructor(
    public id: number,
    public url: string,
    public file: string,
  ) {}
}
function splitFilename(name: string): Array<string> {
  const i = name.lastIndexOf(".");
  if (i == -1) {
    return [name, ""];
  }
  return [name.substring(0, i), name.substring(i)];
}
function pahtJoin(base: string, path: string): string {
  if (Deno.build.os === "windows" && base.endsWith("\\")) {
    return base + path;
  } else if (base.endsWith("/")) {
    return base + path;
  } else {
    return base + "/" + path;
  }
}
class Context {
  constructor(
    public readonly client: Client,
    public readonly id: string,
    public readonly output: string,
  ) {}
  async serve() {
    const output = pahtJoin(this.output, this.id);
    log.info(`download to: ${output}`);
    await Deno.mkdir(output, {
      recursive: true,
    });

    // 獲取照片列表
    const client = this.client;
    const arrs = await this._list(client, this.id);

    log.info(`find: ${arrs.length}`);
    for (let i = 0; i < arrs.length; i++) {
      const item = arrs[i];
      log.info(` - ${i + 1}/${arrs.length} id=${item.id} file=${item.file}`);
      await this._downlod(client, output, item);
    }
  }
  private _name(set: Set<string>, id: number, name: string): string {
    if (!set.has(name)) {
      set.add(name);
      return name;
    }
    const [s, ext] = splitFilename(name);
    return `${s}_${id}${ext}`;
  }
  private async _list(
    client: Client,
    id: string,
  ): Promise<Array<ImageDownload>> {
    const arrs = new Array<ImageDownload>();
    const keys = new Map<number, ImageDownload>();
    const names = new Set<string>();
    let page = 0;
    const limit = 100;
    while (true) {
      const resp = await client.getImages(id, page++, limit);
      const images = resp.result.images;
      if (!Array.isArray(images) || images.length == 0) {
        break;
      }
      page++;
      for (const image of images) {
        const name = this._name(names, image.id, image.file);
        names.add(name);

        const old = keys.get(image.id);
        if (old) {
          old.url = image.element_url;
          old.file = name;
        } else {
          const node = new ImageDownload(
            image.id,
            image.element_url,
            name,
          );
          arrs.push(node);
          keys.set(image.id, node);
        }
      }
    }
    return arrs;
  }
  private async _downlod(client: Client, dir: string, item: ImageDownload) {
    const cookie = await client.cookie();
    const dst = pahtJoin(dir, item.file);
    await download(dst, item.url, {
      Cookie: cookie.cookie,
    });
  }
}

export const downloadCommand = new Command({
  use: "download",
  short: "download album to local filesystem",
  long: `download album to local filesystem

# download album by id [1,2,3] from sever http://127.0.0.1:8000
piwigo.ts download 1 2 3 -Uhttp://127.0.0.1:8000/ws.php -uabc -p456
`,
  prepare: (flags) => {
    const fo = flags.string({
      name: "output",
      default: "piwigo",
      short: "o",
      usage: "The downloaded file is saved in the local file folder path",
    });
    const furl = flags.string({
      name: "url",
      usage: "Piwigo server url",
      short: "U",
      isValid: (v) => {
        if (!v.startsWith("http://") && !v.startsWith("https://")) {
          return false;
        }
        try {
          new URL(v);
          return true;
        } catch (_) {
          return false;
        }
      },
    });
    const fu = flags.string({
      name: "user",
      usage: "username for server",
      short: "u",
    });
    const fp = flags.string({
      name: "password",
      usage: "password of username",
      short: "p",
    });
    return async (args) => {
      const output = fo.value;
      const url = new URL(furl.value);
      const username = fu.value;
      const password = fp.value;
      log.info(`url=${url} username=${username} password=${password}`);
      log.debug(`output=${output}`);
      log.debug(`id [${args}]`);
      const client = new Client(url, username, password);

      for (const id of args) {
        const ctx = new Context(client, id, output);
        await ctx.serve();
      }
    };
  },
});
