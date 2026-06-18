import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LiveBadge } from '@/components/home/LiveBadge'

describe('LiveBadge', () => {
  it('renders minute when provided', () => {
    render(<LiveBadge minute={67} />)
    expect(screen.getByText("67'")).toBeInTheDocument()
  })

  it('renders LIVE text', () => {
    render(<LiveBadge minute={23} />)
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })
})
