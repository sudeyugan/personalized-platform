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
    expect(screen.queryByRole('heading', { name: '先做 4 张候选，再做 2 次微调' })).not.toBeInTheDocument()
  })

  it('explains that browser preview cannot create a desktop diagnostic package', async () => {
    render(<HelpView />)
    fireEvent.click(screen.getByRole('button', { name: '导出诊断包' }))
    expect(await screen.findByText('诊断包仅在 Windows 桌面版可用')).toBeInTheDocument()
  })
})
