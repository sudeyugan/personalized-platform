import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSeedLibrary } from '../../domain/seed'
import { useLibraryStore } from '../../state/useLibraryStore'
import { HelpView } from './HelpView'

describe('HelpView', () => {
  beforeEach(() => {
    const data = createSeedLibrary()
    useLibraryStore.setState({ data, ready: true, saveStatus: 'idle', recoveryDrafts: {} })
  })

  it('shows help without requiring a fixed acceptance checklist', () => {
    render(<HelpView />)
    expect(screen.getByText(/不要求完成固定验收清单/)).toBeInTheDocument()
    expect(screen.queryByText('十个验收场景')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始 7 天试用记录' })).not.toBeInTheDocument()
    expect(screen.getByText('自定义背景图', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByText('待办与周期次数', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.getByText('私密词典与发送前保护', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '先做 4 张候选，再做 2 次微调' })).not.toBeInTheDocument()
  })

  it('filters help topics without hiding support tools', () => {
    render(<HelpView />)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索帮助' }), { target: { value: 'WebM' } })
    expect(screen.getByText('静态立绘与动态 WebM', { selector: 'summary' })).toBeInTheDocument()
    expect(screen.queryByText('待办休假', { selector: 'summary' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出诊断包' })).toBeInTheDocument()
  })

  it('explains that browser preview cannot create a desktop diagnostic package', async () => {
    render(<HelpView />)
    fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }))
    expect(await screen.findByText('诊断包仅在 Windows 桌面版可用')).toBeInTheDocument()
  })
})
