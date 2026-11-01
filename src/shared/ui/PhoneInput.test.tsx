import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { formatSubscriber, PhoneInput, subscriberDigitsOf } from './PhoneInput'

describe('subscriberDigitsOf', () => {
  it('accepts every shape a number gets pasted in', () => {
    for (const input of ['+998901234567', '998901234567', '901234567', '+998 90 123 45 67']) {
      expect(subscriberDigitsOf(input)).toBe('901234567')
    }
  })

  it('keeps a local number whose operator code starts with 998', () => {
    expect(subscriberDigitsOf('998')).toBe('998')
    expect(subscriberDigitsOf('99-831-12-23')).toBe('998311223')
    expect(subscriberDigitsOf('+998998311223')).toBe('998311223')
    expect(subscriberDigitsOf('998998311223')).toBe('998311223')
  })

  it('refuses to grow past the national number length', () => {
    expect(subscriberDigitsOf('9012345678999')).toHaveLength(9)
  })

  it('returns nothing for input with no digits', () => {
    expect(subscriberDigitsOf('salom')).toBe('')
  })
})

describe('formatSubscriber', () => {
  it('groups a full number', () => {
    expect(formatSubscriber('901234567')).toBe('90-123-45-67')
  })

  it('groups every prefix while typing', () => {
    expect(formatSubscriber('9')).toBe('9')
    expect(formatSubscriber('901')).toBe('90-1')
    expect(formatSubscriber('90123')).toBe('90-123')
    expect(formatSubscriber('9012345')).toBe('90-123-45')
  })
})

/**
 * The component is controlled by design — react-hook-form owns the value in
 * every real use — so typing has to be exercised through a controlling parent.
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
    <PhoneInput
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
      value={value}
    />
  )
}

describe('PhoneInput', () => {
  it('emits E.164 as §10 expects it', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), '901234567')

    expect(onChange).toHaveBeenLastCalledWith('+998901234567')
  })

  it('does not clear the field when the local number starts with 99-8', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.type(screen.getByRole('textbox'), '998311223')

    expect(onChange).toHaveBeenLastCalledWith('+998998311223')
    expect(screen.getByRole('textbox')).toHaveValue('99-831-12-23')
  })

  it('replaces a digit in the middle where the caret is, not at the end', async () => {
    const onChange = vi.fn()
    render(<Controlled initial="+998997652134" onChange={onChange} />)
    const input = screen.getByRole<HTMLInputElement>('textbox')

    await userEvent.click(input)
    // "99-7|65-21-34": swap the 7 for an 8.
    input.setSelectionRange(4, 4)
    await userEvent.keyboard('{Backspace}8')

    expect(input).toHaveValue('99-865-21-34')
    expect(onChange).toHaveBeenLastCalledWith('+998998652134')
    expect(input.selectionStart).toBe(4)
  })

  it('normalises a pasted number that repeats the country code', async () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)

    await userEvent.click(screen.getByRole('textbox'))
    await userEvent.paste('+998 90 123 45 67')

    expect(onChange).toHaveBeenLastCalledWith('+998901234567')
  })

  it('focuses the input when the +998 prefix is clicked', async () => {
    render(<PhoneInput value="" />)

    await userEvent.click(screen.getByText('+998-'))

    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('shows the number grouped but stores it plain', () => {
    render(<PhoneInput value="+998901234567" />)

    expect(screen.getByRole('textbox')).toHaveValue('90-123-45-67')
  })

  it('emits an empty string rather than a bare country code', async () => {
    const onChange = vi.fn()
    render(<PhoneInput onChange={onChange} value="+998901234567" />)

    await userEvent.clear(screen.getByRole('textbox'))

    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
