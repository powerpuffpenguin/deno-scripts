import { Command, Parser } from "../lib/flags.ts";
import { downloadCommand } from "./piwigo/download.ts";
import { log } from "../deps/std/log.ts";
const l = log.getLogger();
// 調整日誌輸出等級(默認爲 INFO)
l.level = log.LogLevels.DEBUG;
// 將 handlers 的輸出等級設置到和 logger 一致
l.handlers.forEach((h) => {
  h.level = l.level;
  h.levelName = l.levelName;
});

const version = "v0.0.1";
const root = new Command({
  use: "piwigo.ts",
  long: "Connect to piwigo server and perform some tasks",
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
root.add(downloadCommand);
new Parser(root).parse(Deno.args);
