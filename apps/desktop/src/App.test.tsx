import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { createSeedLibrary } from './domain/seed'
import { useLibraryStore } from './state/useLibraryStore'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    useLibraryStore.setState({ data: createSeedLibrary(), ready: false, saveStatus: 'idle', health: null, recoveryDrafts: {}, playback: { playing: false, context: 'global', queue: [] }, temporaryCompanionWorkIds: [] })
  })

  it('opens the quiet home workspace', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: /好|夜深了/ })).toHaveTextContent('欢迎回到一隅')
    expect(screen.getByRole('button', { name: /继续写作/ })).toBeInTheDocument()
  })

  it('keeps a usable single-column editor in focus mode', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /继续写作/ }))
    fireEvent.click(await screen.findByRole('button', { name: '专注模式' }, { timeout: 5_000 }))
    await waitFor(() => expect(document.querySelector('.app-frame')).toHaveClass('focus-mode'))
    expect(document.querySelector('.writing-layout')).toHaveClass('focus-writing')
    expect(document.querySelector('.chapter-sidebar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出专注' })).toBeInTheDocument()
  })

  it('renders themed desktop window controls', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: /欢迎回到一隅/ })
    expect(screen.getByRole('button', { name: '最小化' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '最大化或还原' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
  })

  it('shows a styled background picker with image guidance', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    expect(await screen.findByText(/内容背景推荐 16:9、1920 × 1080/)).toBeInTheDocument()
    expect(await screen.findByText('通用背景')).toBeInTheDocument()
  })

  it('opens the built-in help center without a mandatory checklist', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '帮助中心' }))
    expect(await screen.findByRole('heading', { name: '遇到问题时，从这里开始' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '十个验收场景' })).not.toBeInTheDocument()
  })

  it('organizes the long settings page into remembered collapsible categories', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    const appearance = await screen.findByRole('button', { name: /外观与写作/ })
    expect(appearance).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /智能创作/ })).toHaveAttribute('aria-expanded', 'false')
    const dataCategory = screen.getByRole('button', { name: /数据管理/ })
    fireEvent.click(dataCategory)
    expect(dataCategory).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByRole('heading', { name: '备份与完整恢复' })).toBeInTheDocument()
    expect(localStorage.getItem('yiyu.settings.category.data')).toBe('open')
    fireEvent.click(appearance)
    expect(screen.queryByText('选择图片')).not.toBeInTheDocument()
  })

  it('keeps intelligent creation controls compact, grouped and explicit about provider checks', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '设置' }))
    fireEvent.click(screen.getByRole('button', { name: /智能创作/ }))
    expect(await screen.findByRole('heading', { name: '伙伴与权限中心' })).toBeInTheDocument()
    expect(screen.getByText('伙伴外观')).toBeInTheDocument()
    expect(screen.getByText('对话服务')).toBeInTheDocument()
    expect(screen.getByText('可读取内容')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '检查 Provider 配置' })).toBeInTheDocument()
    expect(screen.queryByText('HTTPS Endpoint')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '允许伙伴读取资料概览' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: '伙伴形象与成长' })).toBeInTheDocument()
    expect(screen.getByText('可治理记忆')).toBeInTheDocument()
    expect(screen.getByText('选择角色文件夹')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '新增伙伴记忆' }), { target: { value: '喜欢安静的提醒' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(screen.getByDisplayValue('喜欢安静的提醒')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换记忆授权' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('documents the Image 2 character package workflow in the help center', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '帮助中心' }))
    fireEvent.click(await screen.findByText('桌面伙伴差分立绘'))
    expect(screen.getByText(/共约 35–54 张 PNG/)).toBeInTheDocument()
    expect(screen.getByText(/character\.json/)).toBeInTheDocument()
  })

  it('switches between chapters without entering the error boundary', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /继续写作/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '新建章节' }).at(-1)!)
    fireEvent.click(screen.getByText('写在开始之前', { selector: '.chapter-row strong' }))
    await waitFor(() => expect(document.querySelector('.editor-header h1')).toHaveTextContent('写在开始之前'))
    expect(document.querySelectorAll('.editor-pane')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: '界面暂时无法继续' })).not.toBeInTheDocument()
  })

  it('folds secondary editor tools and exposes chapter deletion from the active row', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /继续写作/ }))
    const moreTools = await screen.findByRole('button', { name: '更多工具' })
    expect(moreTools).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerDown(moreTools)
    expect(moreTools).toHaveAttribute('aria-expanded', 'true')

    const deleteChapter = screen.getByRole('button', { name: /删除章节：写在开始之前/ })
    fireEvent.click(deleteChapter)
    expect(screen.getByRole('dialog', { name: '将章节移入回收站？' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '移入回收站' }))
    await waitFor(() => expect(useLibraryStore.getState().data.chapters['chapter-welcome'].deletedAt).toBeTruthy())
  })

  it('opens the M7 music library and keeps companion access denied by default', async () => {
    render(<App />)
    expect(screen.queryByText(/声音会在页面间继续/)).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '音乐' }))
    expect(await screen.findByRole('heading', { name: '让声音留在写作之间' })).toBeInTheDocument()
    expect(screen.getByText(/自动切歌默认关闭/)).toBeInTheDocument()
    expect(screen.getByText(/声音会在页面间继续/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭音乐提示' }))
    expect(screen.queryByText(/声音会在页面间继续/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '写作' }))
    expect(await screen.findByText('未授权任何上下文')).toBeInTheDocument()
    expect(screen.getByText(/不会主动读取内容/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开伙伴侧栏' }))
    expect(screen.getByRole('button', { name: '关闭伙伴侧栏' })).toBeInTheDocument()
  })
})
