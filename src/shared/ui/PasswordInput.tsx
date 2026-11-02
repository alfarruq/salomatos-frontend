import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Input, type InputProps } from './Input'

export interface PasswordInputProps extends Omit<InputProps, 'type'> {
  /** Accessible name of the toggle while the password is hidden. Callers translate it. */
  showLabel: string
  /** Accessible name of the toggle while the password is visible. */
  hideLabel: string
}

/**
 * Password field with a show/hide toggle, so the person typing a new staff
 * password can check it before saving.
 */
export function PasswordInput({
  showLabel,
  hideLabel,
  disabled,
  className,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)
  const Icon = isVisible ? EyeOff : Eye

  return (
    <div className="relative">
      <Input
        {...props}
        className={cn('pr-12', className)}
        disabled={disabled}
        type={isVisible ? 'text' : 'password'}
      />
      <button
        aria-label={isVisible ? hideLabel : showLabel}
        aria-pressed={isVisible}
        className={cn(
          'absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-control',
          'text-text-secondary hover:text-text',
          'transition-colors duration-150 ease-out-apple',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
        disabled={disabled}
        onClick={() => setIsVisible((v) => !v)}
        type="button"
      >
        <Icon aria-hidden className="size-4" />
      </button>
    </div>
  )
}
