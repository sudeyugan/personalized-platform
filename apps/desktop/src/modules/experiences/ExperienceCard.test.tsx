import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { defaultTierLabels, type ExperienceEntry } from '../../domain/experiences'
import { ExperienceCard } from './ExperienceCard'

vi.mock('./ExperienceArtwork', () => ({ ExperienceArtwork: () => <div data-testid="cover" /> }))
const entry: ExperienceEntry = { id: 'card', title: '夏洛特', creator: 'Charlotte', category: 'anime', note: '', dateText: '', paperStyle: 'blue', order: 0, createdAt: '', updatedAt: '' }

describe('compact experience cover cards', () => {
  it('keeps the cover and open action without invented notes, dates or repeated stamps', () => {
    const onOpen = vi.fn()
    render(<ExperienceCard entry={entry} labels={defaultTierLabels} onOpen={onOpen} />)
    const card = screen.getByRole('button', { name: '查看夏洛特' })
    expect(within(card).getByTestId('cover')).toBeInTheDocument()
    expect(within(card).getByText('动漫')).toBeInTheDocument()
    expect(card.querySelector('p')).toBeNull()
    expect(card.querySelector('footer')).toBeNull()
    expect(card).not.toHaveTextContent('留下名字，也是记得。')
    expect(card).not.toHaveTextContent('私人收藏')
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('shows real impressions, dates and custom ranks while keeping the full title accessible', () => {
    const title = '一部名字很长但完整名称仍然应该可以查看的作品'.repeat(3)
    render(<ExperienceCard entry={{ ...entry, title, note: '很久以后，还是记得那个夏天。', dateText: '2026 夏', tier: 'top' }} labels={{ ...defaultTierLabels, top: '心里最特别的一部' }} onOpen={() => {}} />)
    const card = screen.getByRole('button', { name: '查看' + title })
    expect(within(card).getByRole('heading')).toHaveAttribute('title', title)
    expect(card).toHaveTextContent('很久以后，还是记得那个夏天。')
    expect(card).toHaveTextContent('2026 夏')
    expect(card).toHaveTextContent('心里最特别的一部')
  })

  it('uses the landscape place variant without reserving whitespace for empty impressions', () => {
    render(<ExperienceCard entry={{ ...entry, category: 'place', title: '海边', creator: ' ', note: ' \n ', dateText: ' ' }} labels={defaultTierLabels} onOpen={() => {}} />)
    const card = screen.getByRole('button', { name: '查看海边' })
    expect(card).toHaveClass('experience-card-place')
    expect(within(card).getByText('足迹')).toBeInTheDocument()
    expect(card.querySelector('.experience-card-writing > small')).toBeNull()
    expect(card.querySelector('p')).toBeNull()
    expect(card).not.toHaveTextContent('曾经到过')
  })
})
