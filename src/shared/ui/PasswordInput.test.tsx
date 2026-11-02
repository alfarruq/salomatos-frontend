import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PasswordInput } from './PasswordInput'

describe('PasswordInput', () => {
  it('reveals and hides the typed password', async () => {
    render(<PasswordInput aria-label="Parol" hideLabel="Yashirish" showLabel="Ko'rsatish" />)
    const input = screen.getByLabelText('Parol')

    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: "Ko'rsatish" }))
    expect(input).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Yashirish' }))
    expect(input).toHaveAttribute('type', 'password')
  })
})
