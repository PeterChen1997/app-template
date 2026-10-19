# RELEASE NOTES — __APP_NAME__

> App 每个 build 写给测试者看的变更记录（人话，新的在前）。
> `/app-testflight` 流水线递增 build 号后会检查这里有没有 `## <version>(<build>)` 标题的条目，
> 没有直接 `CHANGELOG_MISSING` 退出——**先写条目再发**。
> 条目内容也用作 TestFlight「测试内容」（What to Test）的底稿。

格式（标题必须顶格写成 `## 版本(build)`，例如 `## 1.0.0(2)`），每条下面列：

    ## 1.0.0(2)

    - 新增：……
    - 修复：……
    - 请重点测：……

（上面的示例故意缩进了四格，不会被流水线当成真实条目。）
