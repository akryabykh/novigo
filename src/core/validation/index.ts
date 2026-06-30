// zod schemas — the one place input shapes are validated before hitting Supabase.
// Weights-sum-to-100 (per horizon) is checked via `validateWeights` (core/logic)
// at the call site, where the UI also needs the live remaining-% feedback.
import { z } from 'zod';

export const emailSchema = z.string().trim().min(1, 'Введите email').email('Некорректный email');
export const passwordSchema = z.string().min(8, 'Минимум 8 символов');

export const nameSchema = z.object({
  firstName: z.string().trim().min(1, 'Имя обязательно'),
  lastName: z.string().trim().optional().or(z.literal('')),
  middleName: z.string().trim().optional().or(z.literal('')),
});

export const timeframeSchema = z.enum(['day', 'week', 'month']);

export const goalDraftSchema = z.object({
  title: z.string().trim().min(1, 'Название цели обязательно'),
  timeframe: timeframeSchema,
  target: z.coerce.number().positive('Цель должна быть больше 0'),
  weight: z.coerce.number().min(0, 'Вес ≥ 0').max(100, 'Вес ≤ 100'),
});
export type GoalDraft = z.infer<typeof goalDraftSchema>;

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Проверьте введённые данные';
}
