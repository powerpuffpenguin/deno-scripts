# deno-scripts

deno 寫的一些腳本工具

本喵發現 deno 很適合來寫一些命令行工具，並且 deno 可以直接運行 url 腳本，把一些系統管理的常用腳本用 deno 實現發佈到 github
本喵就再也不想要考慮怎麼把腳本在多個操作系統間同步的問題了，這應該會是一個好注意

# run scripts

1. 將 github 項目設置到環境變量，以方面後續指令輸入

   ```
   export DURL="https://raw.githubusercontent.com/powerpuffpenguin/deno-scripts/main"
   ```

2. 使用 deno run 運行 bin 下的腳本即可

   ```
   deno run "$DURL/bin/main.ts"
   ```

如果想查看腳本的詳細介紹，加上 -h 即可顯示使用說明

```
deno run "$DURL/bin/piwigo.ts" -h
```
