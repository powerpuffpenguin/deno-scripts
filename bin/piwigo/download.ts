import { Command } from "../../lib/flags.ts";
import { log } from "../../deps/std/log.ts";
import { Values } from "../../deps/easyts/net_url.ts";
import { Exception } from "../../deps/easyts/core.ts";

class Context {
  constructor(
    readonly url: URL,
    readonly username: string,
    readonly password: string,
    readonly id: string,
    readonly output: string,
  ) {
  }
  async serve() {
    let output = this.output;
    if (Deno.build.os === "windows" && output.endsWith("\\")) {
      output += this.id;
    } else if (output.endsWith("/")) {
      output += this.id;
    } else {
      output += "/" + this.id;
    }
    log.info(`download to: ${output}`);
    await Deno.mkdir(output, {
      recursive: true,
    });
    await this._login();
    await this._list();
  }
  // deno-lint-ignore no-explicit-any
  private _checkResponse(obj: any) {
    if (obj["stat"] != "ok") {
      throw new Exception(JSON.stringify(obj));
    }
  }
  async _login() {
    const vals = Values.fromObject({
      method: "pwg.session.login",
      format: "json",
    });
    const url = `${this.url}?${vals.encode()}`;
    const resp = await fetch(url, {
      method: "POST",
      body: Values.fromObject({
        username: this.username,
        password: this.password,
      }).encode(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    if (resp.status != 200) {
      throw new Exception(`${resp.status}: ${resp.statusText}`);
    }
    const obj = await resp.json();
    this._checkResponse(obj);
    console.log(resp);
    console.log(resp.headers.get("set-cookie"));
    let str = resp.headers.get("set-cookie") ?? "";
    const tag = "pwg_id=";
    let found = str.indexOf(tag);
    if (found == -1) {
      throw new Exception("not found pwg_id on set-cookie");
    }
    str = str.substring(found + tag.length);
    found = str.indexOf(";");
    if (found != -1) {
      str = str.substring(0, found);
    }
    this.cookie_ = `${tag}${str};`;
  }
  private cookie_ = "";
  async _list() {
    const pageCount = 100;
    const page = 0;
    const vals = Values.fromObject({
      method: "pwg.categories.getImages",
      format: "json",
      cat_id: this.id,
      per_page: pageCount.toString(),
      page: page.toString(),
      order: "id",
    });
    const url = `${this.url}?${vals.encode()}`;
    const resp = await fetch(url, {
      method: "get",
      headers: {
        Accept: "application/json",
        Cookie: this.cookie_,
      },
    });
    const obj = await resp.json();
    this._checkResponse(obj);
    console.log(obj);
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
        if (!v.startsWith("http://") || v.startsWith("https://")) {
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
      for (const id of args) {
        const ctx = new Context(url, username, password, id, output);
        await ctx.serve();
      }
    };
  },
});
