import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Avatar from '@/components/Avatar'

describe('Avatar', () => {
  it('renders without first/last name (customer created from a shop order without a name)', () => {
    const { container } = render(<Avatar firstName={null} lastName={null} />)
    expect(container.firstElementChild).toBeTruthy()
  })

  it('renders initials', () => {
    const { container } = render(<Avatar firstName="Anna" lastName={null} />)
    expect(container.textContent).toBe('A')
  })
})

describe('Avatar – e-mail fallback', () => {
  it('no name → first letter of the e-mail, uppercase', () => {
    const { container } = render(<Avatar firstName={null} lastName={null} email="ola@example.com" />)
    expect(container.textContent).toBe('O')
  })

  it('name wins over e-mail', () => {
    const { container } = render(<Avatar firstName="Anna" lastName="Nowak" email="ola@example.com" />)
    expect(container.textContent).toBe('AN')
  })
})
