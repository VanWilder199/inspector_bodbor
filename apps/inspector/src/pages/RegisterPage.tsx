import { zodResolver } from '@hookform/resolvers/zod';
import { Input, List, Section, Text, Title } from '@telegram-apps/telegram-ui';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ApiError } from '@/api/client';
import { getErrorMessage } from '@/api/errors';
import { getRawInitData } from '@/api/session';
import { FallbackMainButton } from '@/components/FallbackMainButton';
import {
  formatPhone,
  mapServerFieldErrors,
  normalizePhone,
  registerSchema,
  type RegisterFormValues,
} from '@/features/inspector/registerForm';
import { useRegisterInspector } from '@/features/inspector/useInspector';
import { fullNameFromInitData } from '@/telegram/launchParams';
import { useMainButton } from '@/telegram/useMainButton';

const SUBMIT_TEXT = 'Зарегистрироваться';
const ERROR_COLOR = 'var(--tgui--destructive_text_color)';

/** Подпись под полем: сообщение об ошибке красным или ничего. */
function errorFooter(message: string | undefined) {
  return message ? <Section.Footer style={{ color: ERROR_COLOR }}>{message}</Section.Footer> : undefined;
}

/**
 * Регистрация подборщика (сценарий A). После успеха профиль попадает в кеш, и `InspectorGate` сам уводит на `/pending`:
 * отдельного перехода и повторного `GET /inspector/` здесь нет.
 */
export function RegisterPage() {
  const registerInspector = useRegisterInspector();
  const [formError, setFormError] = useState<string>();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    // ФИО берём из Telegram, но подборщик может исправить: бэкенд использует то, что в теле запроса
    defaultValues: { fullName: fullNameFromInitData(getRawInitData()), phone: formatPhone(''), email: '' },
  });

  const submit = handleSubmit(async (values) => {
    // Двойное нажатие (MainButton и Enter одновременно) не должно создать второй запрос
    if (registerInspector.isPending) {
      return;
    }
    setFormError(undefined);
    try {
      await registerInspector.mutateAsync(values);
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setFormError(getErrorMessage({ status: 0, kind: 'network' }));
        return;
      }
      const fieldErrors = mapServerFieldErrors(error.fieldErrors);
      const fields = Object.entries(fieldErrors);
      if (fields.length === 0) {
        setFormError(getErrorMessage(error));
        return;
      }
      for (const [field, message] of fields) {
        setError(field as keyof RegisterFormValues, { message });
      }
    }
  });

  const pending = registerInspector.isPending;
  useMainButton(SUBMIT_TEXT, () => void submit(), { enabled: !pending, loading: pending });

  return (
    <main style={{ padding: 16 }}>
      <Title level="2" weight="2" Component="h1">
        Регистрация
      </Title>
      <Text style={{ display: 'block', margin: '8px 0 12px' }}>
        Расскажите о себе. После проверки аккаунта вы сможете создавать отчёты об осмотре автомобилей.
      </Text>

      <form onSubmit={submit} noValidate aria-label="Регистрация подборщика">
        <List>
          <Section header="ФИО" footer={errorFooter(errors.fullName?.message)}>
            <Input
              aria-label="ФИО"
              autoComplete="name"
              status={errors.fullName ? 'error' : 'default'}
              placeholder="Фамилия Имя Отчество"
              {...register('fullName')}
            />
          </Section>

          <Section header="Телефон" footer={errorFooter(errors.phone?.message)}>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <Input
                  aria-label="Телефон"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  status={errors.phone ? 'error' : 'default'}
                  value={formatPhone(field.value)}
                  onChange={(event) => field.onChange(normalizePhone(event.target.value))}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          </Section>

          <Section header="Email" footer={errorFooter(errors.email?.message)}>
            <Input
              aria-label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              status={errors.email ? 'error' : 'default'}
              {...register('email')}
            />
          </Section>
        </List>

        {formError && (
          <Text role="alert" style={{ display: 'block', margin: '12px 16px', color: ERROR_COLOR }}>
            {formError}
          </Text>
        )}

        <div style={{ padding: '12px 16px' }}>
          <FallbackMainButton text={SUBMIT_TEXT} enabled={!pending} loading={pending} />
        </div>
      </form>
    </main>
  );
}
