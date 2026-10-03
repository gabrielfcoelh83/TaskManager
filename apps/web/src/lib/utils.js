import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Junta classes do Tailwind resolvendo conflitos (`px-2` + `px-4` → `px-4`).
// É o `cn` que todo componente do shadcn importa de `@/lib/utils`.
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
