#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
windows_root="$(wslpath -w "$repo_root")"
windows_build_root='D:\coding\personalized-platform-windows-build'
windows_build_root_linux='/mnt/d/coding/personalized-platform-windows-build'
desktop_exe='/mnt/c/Users/13572/Desktop/一隅_直接运行.exe'
cmd_path="$(command -v cmd.exe || true)"

if [[ -z "$cmd_path" ]]; then
  echo "未找到 cmd.exe；请确认当前终端运行在启用了 Windows 互操作的 WSL 中。" >&2
  exit 1
fi

cmd_dir="$(dirname "$cmd_path")"

usage() {
  cat <<'EOF'
用法：./scripts/windows-project.sh <命令>

命令：
  versions       显示 WSL 与 Windows Node、pnpm、Rust/Cargo 版本
  install        在 WSL 中按 pnpm-lock.yaml 恢复前端依赖
  typecheck      在 WSL 中运行 TypeScript 检查
  build          在 WSL 中构建 Web 前端
  verify-ui      在 WSL 中运行 UI 合并验证
  verify-full    同步 Windows 构建镜像并运行跨层完整验证
  release-build  同步 Windows 构建镜像，构建 Release/NSIS 并更新桌面 EXE
  dev            在 WSL 中启动 Web 开发服务器
  tauri-dev      同步一次 Windows 构建镜像并启动 Tauri 开发版
EOF
}

run_native() {
  (cd "$repo_root" && "$@")
}

show_windows_versions() {
  (
    cd "$cmd_dir"
    ./cmd.exe /d /c "node.exe --version && call pnpm.cmd --version && rustc.exe --version && cargo.exe --version"
  )
}

sync_windows_mirror() {
  echo "同步 Windows 构建镜像：$windows_build_root"
  set +e
  (
    cd "$cmd_dir"
    ./robocopy.exe "$windows_root" "$windows_build_root" /MIR /R:2 /W:1 /NP /NJH /NJS /NFL /NDL /XD .git node_modules target dist .pnpm-store .inputs /XF .env .env.local '*.log'
  )
  robocopy_exit=$?
  set -e
  if ((robocopy_exit > 7)); then
    echo "Windows 构建镜像同步失败，Robocopy 退出码：$robocopy_exit" >&2
    exit "$robocopy_exit"
  fi
}

run_windows() {
  local command_line="$1"
  (
    cd "$cmd_dir"
    ./cmd.exe /d /v:on /c "pushd $windows_build_root && set \"NODE_TLS_REJECT_UNAUTHORIZED=\" && $command_line & set \"exit_code=!errorlevel!\" & popd & exit /b !exit_code!"
  )
}

update_desktop_exe() {
  local release_exe="$windows_build_root_linux/apps/desktop/src-tauri/target/release/yiyu.exe"
  if [[ ! -f "$release_exe" ]]; then
    echo "未找到 Windows Release：$release_exe" >&2
    exit 1
  fi
  cp -f "$release_exe" "$desktop_exe"
  echo "桌面直接运行版已更新：$desktop_exe"
}

case "${1:-}" in
  versions)
    node --version
    pnpm --version
    show_windows_versions
    ;;
  install) run_native pnpm install --frozen-lockfile ;;
  typecheck) run_native pnpm typecheck ;;
  build) run_native pnpm build ;;
  verify-ui) run_native pnpm verify:ui ;;
  verify-full)
    sync_windows_mirror
    run_windows 'call pnpm.cmd install --frozen-lockfile && call pnpm.cmd verify:full'
    ;;
  release-build)
    sync_windows_mirror
    run_windows 'call pnpm.cmd install --frozen-lockfile && call pnpm.cmd release:build'
    update_desktop_exe
    ;;
  dev) run_native pnpm dev ;;
  tauri-dev)
    sync_windows_mirror
    run_windows 'call pnpm.cmd install --frozen-lockfile && call pnpm.cmd tauri:dev'
    ;;
  -h|--help|'') usage ;;
  *) echo "未知命令：$1" >&2; usage >&2; exit 2 ;;
esac
