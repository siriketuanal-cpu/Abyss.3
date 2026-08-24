# GitHub用・平坦配置版

このフォルダ内の全ファイルを、GitHubリポジトリの一番上へ置くための版です。`src`や`assets`フォルダはありません。

GitHub Pagesは、`main`ブランチの`/(root)`を公開元に設定してください。GitHub Actionsは不要です。

PWAの更新時は、関連するファイルだけでなく`sw.js`も一緒に更新してください。端末に古い画面が残る場合は、`sw.js`の`CACHE_NAME`を新しい値に変えてコミットします。
