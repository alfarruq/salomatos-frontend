import { useRef } from 'react'
import { cn } from '@/shared/lib/cn'
import { useFieldControl } from './Field'

const COUNTRY_CODE = '+998'
const COUNTRY_DIGITS = 3
const SUBSCRIBER_LENGTH = 9

export interface PhoneInputProps {
  /**
   * E.164, exactly as §10's schema expects it: `+998901234567`. An incomplete
   * number is emitted the same way so validation, not this component, decides
   * when it is acceptable.
   */
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  id?: string
  name?: string
  className?: string
}

/** Everything after the country code, capped at the national number length. */
export function subscriberDigitsOf(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Tolerates every way a number gets pasted: +998901234567, 998901234567
  // and 901234567 all mean the same thing here. A leading 998 is only the
  // country code when the input says so (a "+") or is long enough to hold it:
  // operator codes like 99 make "99-8..." a perfectly normal local number.
  const hasCountryCode =
    digits.startsWith('998') &&
    (raw.trimStart().startsWith('+') || digits.length >= COUNTRY_DIGITS + SUBSCRIBER_LENGTH)
  const withoutCountry = hasCountryCode ? digits.slice(COUNTRY_DIGITS) : digits
  return withoutCountry.slice(0, SUBSCRIBER_LENGTH)
}

/** `901234567` → `90-123-45-67`, and every prefix of it while typing. */
export function formatSubscriber(digits: string): string {
  const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
  return groups.filter((group) => group.length > 0).join('-')
}

export function PhoneInput({
  value = '',
  onChange,
  disabled,
  id,
  name,
  className,
}: PhoneInputProps) {
  const field = useFieldControl()
  const inputRef = useRef<HTMLInputElement>(null)
  const digits = subscriberDigitsOf(value)

  const handleChange = (next: string) => {
    const nextDigits = subscriberDigitsOf(next)
    onChange?.(nextDigits.length === 0 ? '' : `${COUNTRY_CODE}${nextDigits}`)
  }

  return (
    <div
      className={cn(
        'flex w-full items-center rounded-control border border-border bg-sunken',
        'transition-[border-color] duration-150 ease-out-apple',
        'hover:border-border-strong',
        'has-[input:disabled]:pointer-events-none has-[input:disabled]:opacity-40',
        'has-[input[aria-invalid=true]]:border-danger',
        'h-11',
        className,
      )}
    >
      {/*
       * The country code is fixed rather than typed: every clinic in this
       * product is in Uzbekistan, and a prefix the user cannot delete removes a
       * whole class of malformed numbers. The trailing dash joins it visually
       * to the editable part, so the whole field reads as one grouped number
       * (`+998-90-123-45-67`) rather than a code next to an unrelated input.
       */}
      {/*
       * The prefix looks like part of the field, so a click on it has to land
       * in the input too. preventDefault keeps the input from blurring first;
       * it is aria-hidden and the input stays the only keyboard stop.
       */}
      <span
        aria-hidden="true"
        className="cursor-text pl-4 text-body text-text-secondary"
        onMouseDown={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        {COUNTRY_CODE}-
      </span>

      <input
        ref={inputRef}
        id={id ?? field?.controlId}
        name={name}
        disabled={disabled}
        type="tel"
        // Brings up the numeric keypad on a phone without rejecting spaces.
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="90-123-45-67"
        value={formatSubscriber(digits)}
        onChange={(event) => handleChange(event.target.value)}
        aria-describedby={field?.describedBy}
        aria-invalid={field?.isInvalid ?? undefined}
        className={cn(
          // Tighter left padding than the right: the fixed "-" just before
          // this input already carries the visual separation §11 wants
          // between two pieces of text, so a full `px-3` here would read as a
          // gap between the code and the number rather than one joined field.
          'w-full bg-transparent py-0 pr-3 pl-1 text-body text-text outline-none',
          'placeholder:text-text-secondary',
        )}
      />
    </div>
  )
}
