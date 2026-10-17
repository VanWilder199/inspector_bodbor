import { OTPInput, OTPInputContext } from 'input-otp';
import { useContext, type ComponentProps } from 'react';
import { cn } from '../../lib/utils';

function InputOTP({ className, containerClassName, ...props }: ComponentProps<typeof OTPInput> & { containerClassName?: string }) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn('flex items-center gap-2 has-disabled:opacity-50', containerClassName)}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="input-otp-group" className={cn('flex items-center gap-2', className)} {...props} />;
}

function InputOTPSlot({ index, className, ...props }: ComponentProps<'div'> & { index: number }) {
  const context = useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = context?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex h-14 w-12 items-center justify-center rounded-control bg-input text-title font-semibold text-foreground transition',
        'data-[active=true]:ring-4 data-[active=true]:ring-ring',
        'aria-invalid:ring-2 aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-px animate-pulse bg-foreground" />
        </div>
      )}
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot };
