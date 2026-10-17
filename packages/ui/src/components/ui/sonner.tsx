import { Toaster as Sonner, type ToasterProps } from 'sonner';

/* Toast для ошибок мутаций и коротких подтверждений. Тёмной темы пока нет — тема фиксированная. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="top-center"
      toastOptions={{
        classNames: {
          toast: 'rounded-control! border-0! bg-foreground! text-background! font-sans! shadow-lg!',
          description: 'text-background/70!',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
