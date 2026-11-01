import { cn } from '@/shared/lib/cn'
import { handleMaskedChange } from '@/shared/lib/maskedInput'
import { useFieldControl } from './Field'

export interface MoneyInputProps {
  /** Whole-number digits only, e.g. `'1200000'`. `''` means unset, never `'0'`. */
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  id?: string
  name?: string
  placeholder?: string
  className?: string
}

/** Whatever was typed or pasted, kept to digits — no decimals, no separators. */
export function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '')
}

/** `1200000` → `1,200,000`, and every prefix of it while typing. */
export function formatThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * A whole-number amount, grouped by thousands while typing.
 *
 * Not `type="number"`, for the same reason `TreatmentTypeFormFields` gave up
 * on it before this component existed: spinners, scroll-wheel edits, and a
 * value that silently goes empty on a stray character. The commas are display
 * only — `onChange` always emits plain digits, which is what the form schema
 * and the wire payload expect (`toTreatmentTypePayload` converts that to a
 * number, not this component).
 */
export function MoneyInput({
  value = '',
  onChange,
  disabled,
  id,
  name,
  placeholder,
  className,
}: MoneyInputProps) {
  const field = useFieldControl()
  const display = formatThousands(digitsOf(value))

  return (
    <input
      id={id ?? field?.controlId}
      name={name}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={display}
      onChange={(event) =>
        onChange?.(
          digitsOf(handleMaskedChange(event, display, (raw) => formatThousands(digitsOf(raw)))),
        )
      }
      aria-describedby={field?.describedBy}
      aria-invalid={field?.isInvalid ?? undefined}
      className={cn(
        'w-full rounded-control border border-border bg-sunken px-4 text-body text-text',
        'h-11 outline-none',
        'transition-[border-color] duration-150 ease-out-apple',
        'hover:border-border-strong',
        'placeholder:text-text-secondary',
        'disabled:pointer-events-none disabled:opacity-40',
        'aria-invalid:border-danger',
        className,
      )}
    />
  )
}
