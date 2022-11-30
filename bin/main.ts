import "../lib/env_main.ts";
import { root as piwigo } from "./piwigo.ts";
import { Command, Parser } from "../deps/flags/mod.ts";
import * as log from "../deps/std/log/mod.ts";
const version = "v0.0.1";
const root = new Command({
  use: "main.ts",
  short: "Some utility scripts written by deno",
  prepare: (flags) => {
    const fv = flags.bool({
      name: "version",
      short: "v",
      default: false,
      usage: "display version",
    });
    return (_, cmd) => {
      if (fv.value) {
        console.log(version);
      } else {
        cmd.print();
      }
    };
  },
});
root.add(piwigo);

const l = log.getLogger();
// 調整日誌輸出等級(默認爲 INFO)
l.level = log.LogLevels.DEBUG;
// 將 handlers 的輸出等級設置到和 logger 一致
l.handlers.forEach((h) => {
  h.level = l.level;
  h.levelName = l.levelName;
});
new Parser(root).parse(Deno.args);
