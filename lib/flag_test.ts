// deno-lint-ignore-file no-explicit-any
import { Command, Parser } from "./flags.ts";
import { assertEquals } from "std/testing/asserts.ts";
function createRoot(vals: Array<any>) {
  return new Command({
    use: "main",
    prepare: (flags) => {
      const n = flags.number({
        name: "number",
        default: 0,
        short: "n",
      });
      const v = flags.bool({
        name: "version",
        default: false,
        short: "v",
      });
      const d = flags.bool({
        name: "date",
        default: true,
        short: "d",
      });
      return () => {
        assertEquals(n.value, vals[0]);
        assertEquals(v.value, vals[1]);
        assertEquals(d.value, vals[2]);
      };
    },
  });
}
Deno.test("parser", () => {
  let vals = [5, true, true];
  new Parser(createRoot(vals)).parse(["-vn", "5"]);
  new Parser(createRoot(vals)).parse(["-vn=5"]);
  vals = [6, false, false];
  new Parser(createRoot(vals)).parse(["--number", "6", "-d", "false"]);
  new Parser(createRoot(vals)).parse(["--number", "6", "-d=false"]);
});
