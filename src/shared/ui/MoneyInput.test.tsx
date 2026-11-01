import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { digitsOf, formatThousands, MoneyInput } from './MoneyInput'

describe('digitsOf', () => {
  it('strips everything but digits', () => {
    expect(digitsOf('1,200,000')).toBe('1200000')
  })

  it('returns nothing for input with no digits', () => {
    expect(digitsOf("so'm")).toBe('')
  })
})

describe('formatThousands', () => {
  it('groups a large amount', () => {
    expect(formatThousands('3234000')).toBe('3,234,000')
  })

  it('groups every prefix while typing', () => {
    expect(formatThousands('1')).toBe('1')
    expect(formatThousands('12')).toBe('12')
    expect(formatThousands('123')).toBe('123')
    expect(formatThousands('1234')).toBe('1,234')
    expect(formatThousands('12345')).toBe('12,345')
    expect(formatThousands('123450')).toBe('123,450')
    expect(formatThousands('1234500')).toBe('1,234,500')
  })

  it('leaves an empty amount alone', () => {
    expect(formatThousands('')).toBe('')
  })
})

/**
 * Controlled by design, like `PhoneInput` — react-hook-form owns the value in
 * every real use.
 */
function Controlled({
  onChange,
  initial = '',
}: {
  onChange: (value: string) => void
  initial?: string
}) {
  const [value, setValue] = useState(initial)
  return (
    <MoneyInput
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      value={value}
    />
  )
}

describe('MoneyInput', () => {
  it('shows the amount grouped but stores it plain', () => {
    render(<MoneyInput value="3234000" />)

    expect(screen.getByRole('textbox')).toHaveValue('3,234,000')
  })

  it('emits plain digits as the amount grows', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), '1200000')

    expect(onChange).toHaveBeenLastCalledWith('1200000')
    expect(screen.getByRole('textbox')).toHaveValue('1,200,000')
  })

  it('edits a digit in the middle without throwing the caret to the end', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="1200000" onChange={onChange} />)
    const input = screen.getByRole<HTMLInputElement>('textbox')

    await userEvent.click(input)
    // "1,2|00,000": swap the 2 for a 5.
    input.setSelectionRange(3, 3)
    await userEvent.keyboard('{Backspace}5')

    expect(input).toHaveValue('1,500,000')
    expect(onChange).toHaveBeenLastCalledWith('1500000')
    expect(input.selectionStart).toBe(3)
  })

  it('ignores a pasted currency word or separator rather than rejecting the amount', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.paste("1,200,000 so'm")

    expect(onChange).toHaveBeenLastCalledWith('1200000')
  })

  it('emits an empty string when cleared, not a stray comma', async () => {
    const onChange = vi.fn()
    render(<MoneyInput onChange={onChange} value="3234000" />)

    await userEvent.clear(screen.getByRole('textbox'))

    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
