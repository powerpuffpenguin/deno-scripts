# deno-scripts

deno 寫的一些腳本工具

本喵發現 deno 很適合來寫一些命令行工具，並且 deno 可以直接運行 url 腳本，把一些系統管理的常用腳本用 deno 實現發佈到 github
本喵就再也不想要考慮怎麼把腳本在多個操作系統間同步的問題了，這應該會是一個好注意

index

- [piwigo.ts](#piwigots)

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

# piwigo.ts

這個腳本主要用於將 piwigo 服務器上的相冊下載下來

| 權限要求          | 使用目的                            |
| ------------- | ------------------------------- |
| --allow-net   | 連接 piwigo 服務器                   |
| --allow-write | 將下載照片存儲到本地檔案系統                  |
| --allow-read  | 讀取本地系統未完成下載以便能夠恢復異常的下載而不用整個重新下載 |

下面的例子下載相冊id爲 9 和 10 的相冊：

```
export DURL="https://raw.githubusercontent.com/powerpuffpenguin/deno-scripts/main"

deno run -A "$DURL/bin/piwigo.ts" download -U http://localhost/ws.php 9 10
```

| 參數 | 含義         | 備註                                        |
| -- | ---------- | ----------------------------------------- |
| -U | 指定服務器網址    | 注意要加上路徑 /ws.php，piwigo 服務器使用這個路徑提供了各種數據接口 |
| -u | 指定用戶名      | 如果下載私密相冊需要使用此用戶進行登入                       |
| -p | 指定用戶密碼     |                                           |
| -o | 指定下載數據輸出目錄 | 默認爲 ./piwigo                              |
