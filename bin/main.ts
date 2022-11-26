import { Chan } from "../deps/easyts/core/channel.ts";

const c = new Chan<number>();
(async () => {
  for (let i = 0; i < 5; i++) {
    await c.write(i);
  }
  await c.close();
})();

for await (const v of c) {
  console.log(v);
}
