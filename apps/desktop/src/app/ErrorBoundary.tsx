import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Yiyu UI crashed', error, info.componentStack)
  }

  render() {
    if (this.state.failed) {
      return <main className="launch-screen"><div className="brand-mark">隅</div><h1>界面暂时无法继续</h1><p>你的内容仍保存在本地。请重启一隅；若问题持续，请保留日志后反馈。</p><button className="primary-button" onClick={() => window.location.reload()}>重新载入</button></main>
    }
    return this.props.children
  }
}
