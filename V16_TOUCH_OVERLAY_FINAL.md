# v16 タッチ暗転回帰・最終修正記録

公開コミット: `0f85487fa4f4a5c3b367ad6d321f26e350e91c5a`

## 修正内容

GジェネおよびSTAR LEAPの編集確認待機では、暗転用の`#backdrop`がゲーム領域より前面にあり、Android Chromeの実タップが編集カードへ届かない状態になっていた。`#gamesAll`は`contain`により独立した重なり文脈を作るため、カード単体の`z-index`では不十分だった。

GジェネまたはSTAR LEAPの編集確認待機中だけ、`#gamesAll`自体へ`editing-above-backdrop`を付けて`z-index: 30`へ前面化した。暗転表示は維持しつつ、2回目タップ・入力欄へのフォーカスを通す。

## 更新経路

`update.html`はService Workerと`abyss2-game-split-*`キャッシュを削除後、毎回一意なクエリ付きアプリURLへ遷移する。これにより、通常HTTPキャッシュに残った旧`index.html`が再利用されることを避ける。

## 確認済み

- 本番v16で、Gジェネの暗転後に実座標タップから現在値入力が開く。
- 本番v16で、STAR LEAPの暗転後に実座標タップから現在値入力が開く。
- Gジェネの長押し上限値入力を確認した。
- 比較版ダッシュボードで、放置報酬を通常タップで確認待機にした後、`touchstart`/`touchend`の長押しで受取が確定することを確認した。
- 保存キー`dotabyss:unified:v1`は変更していない。
