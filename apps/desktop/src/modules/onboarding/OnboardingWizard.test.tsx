import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OnboardingWizard } from './OnboardingWizard'

describe('OnboardingWizard', () => {
  it('collects storage, backup and theme choices before creating the library', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined)
    render(<OnboardingWizard defaultDirectory="C:\\Users\\Test\\AppData\\Yiyu" onComplete={onComplete} />)

    expect(screen.getByRole('heading', { name: '欢迎来到一隅' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }))
    fireEvent.change(screen.getByLabelText(/资料库目录/), { target: { value: 'D:\\一隅资料' } })
    fireEvent.change(screen.getByLabelText(/备份目录/), { target: { value: 'E:\\一隅备份' } })
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }))
    fireEvent.click(screen.getByRole('button', { name: /深夜书房/ }))
    fireEvent.click(screen.getByRole('button', { name: /进入一隅/ }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith({ libraryDirectory: 'D:\\一隅资料', backupDirectory: 'E:\\一隅备份', theme: 'dark' }))
  })

  it('keeps the wizard open and shows a directory error', async () => {
    const onComplete = vi.fn().mockRejectedValue(new Error('STORAGE_PATH:目录不可写'))
    render(<OnboardingWizard defaultDirectory="推荐目录" onComplete={onComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }))
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }))
    fireEvent.click(screen.getByRole('button', { name: /进入一隅/ }))
    expect(await screen.findByText('STORAGE_PATH:目录不可写')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '选择日常偏好' })).toBeInTheDocument()
  })
})
