import { handleMaskedChange } from '@/shared/lib/maskedInput'
import { Input, type InputProps } from './Input'

export interface DateInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'inputMode' | 'maxLength'> {
  /** The typed text, `dd/mm/yyyy` once complete. Parse it with `parseTypedDate`. */
  value: string
  onChange: (value: string) => void
}

/** Keeps the digits and puts the slashes back, so `12051994` reads `12/05/1994`. */
export function maskTypedDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
  return parts.filter((part) => part !== '').join('/')
}

/**
 * A date typed as `dd/mm/yyyy`.
 *
 * For dates people know by heart, such as a birthday: reaching 1994 in a
 * calendar takes dozens of clicks, typing it takes eight keystrokes.
 */
export function DateInput({ value, onChange, ...props }: DateInputProps) {
  return (
    <Input
      autoComplete="off"
      inputMode="numeric"
      maxLength={10}
      onChange={(event) => onChange(handleMaskedChange(event, value, maskTypedDate))}
      type="text"
      value={value}
      {...props}
    />
  )
}
