import { Values } from "../../deps/easyts/net/url.ts";
import { Exception } from "../../deps/easyts/core/exception.ts";
import { Completer } from "../../deps/easyts/core/completer.ts";

class Cookie {
  constructor(
    public readonly cookie: string,
    public readonly at: number,
  ) {
  }
  isValid(): boolean {
    return Date.now() - this.at < 1000 * 3600 * 5;
  }
}

export interface PiwigoResponse {
  stat: "ok" | "fail";
  err?: number;
  message?: string;
}
export interface Paging {
  page: number;
  per_page: number;
  count: number;
  total_count: string; // int64
}
export interface Categorie {
  id: number;
  url: string;
  page_url: string;
}
export interface Derivative {
  url: string;
  width: number;
  height: number;
}
export interface Derivatives {
  square: Derivative;
  thumb: Derivative;
  "2small": Derivative;
  xsmall: Derivative;
  small: Derivative;
  medium: Derivative;
  large: Derivative;
  xlarge: Derivative;
  xxlarge: Derivative;
}
export interface Image {
  is_favorite: boolean;
  id: number;
  width: number;
  height: number;
  hit: number;
  file: string;
  name: string;
  comment: string | null;
  date_creation: string | null;
  date_available: string;
  page_url: string;
  element_url: string;
  derivatives: Derivatives;
  categories: Array<Categorie>;
}
export interface GetImagesResult {
  paging: Paging;
  images: Array<Image>;
}
export interface GetImagesResponse extends PiwigoResponse {
  result: GetImagesResult;
}

export class Client {
  private cookie_?: Cookie;
  constructor(
    public readonly url: URL,
    public readonly username: string,
    public readonly password: string,
  ) {
  }
  // deno-lint-ignore no-explicit-any
  private _checkResponse(obj: any) {
    if (obj["stat"] != "ok") {
      throw new Exception(JSON.stringify(obj));
    }
  }
  private async _login(): Promise<Cookie> {
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
    console.debug(`set-cookie: ${resp.headers.get("set-cookie")}`);
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
    return new Cookie(`${tag}${str};`, Date.now());
  }
  private completer_?: Completer<Cookie>;
  async cookie(): Promise<Cookie | undefined> {
    if (this.username == "" || this.password == "") {
      return;
    }
    let cookie = this.cookie_;
    if (cookie && cookie.isValid()) {
      return cookie;
    }
    let c = this.completer_;
    if (c) {
      return c.promise;
    }
    c = new Completer<Cookie>();
    try {
      cookie = await this._login();
      this.cookie_ = cookie;
      console.info(`cookie: ${cookie.cookie}`);
      c.resolve(cookie);
    } catch (e) {
      this.completer_ = undefined;
      c.reject(e);
    }
    return c.promise;
  }

  /**
   * 獲取相冊中照片信息
   * @param id 相冊 id
   * @param page 要請求的頁數
   * @param limit 每頁最多顯示多少條記錄
   */
  async getImages(
    id: string,
    page: number,
    limit: number,
  ): Promise<GetImagesResponse> {
    const cookie = await this.cookie();
    const vals = Values.fromObject({
      method: "pwg.categories.getImages",
      format: "json",
      cat_id: id,
      page: page.toString(),
      per_page: limit.toString(),
      order: "id",
    });
    const url = `${this.url}?${vals.encode()}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: cookie === undefined
        ? {
          Accept: "application/json",
        }
        : {
          Accept: "application/json",
          Cookie: cookie?.cookie ?? "",
        },
    });
    const obj = await resp.json() as GetImagesResponse;
    this._checkResponse(obj);
    return obj;
  }
}
