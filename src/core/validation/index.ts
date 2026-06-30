// zod schemas — the one place input shapes are validated before hitting Supabase.
// NOTE: the weights-sum-to-100 rule is checked via `validateWeights` (core/logic)
// at the call site, where the UI also needs the live remaining-% feedback.
import { z } from 'zod';

export const emailSchema = z.string().trim().min(1, 'Введите email').email('Некорректный email');
export const passwordSchema = z.string().min(8, 'Минимум 8 символов');
export const otpSchema = z.string().trim().regex(/^\d{6}$/, 'Код из 6 цифр');

export const nameSchema = z.object({
  firstName: z.string().trim().min(1, 'Имя обязательно'),
  lastName: z.string().trim().optional().or(z.literal('')),
  middleName: z.string().trim().optional().or(z.literal('')),
});

export const periodSchema = z.enum(['1w', '2w', '1m']);
export const goalTypeSchema = z.enum(['daily', 'period']);

export const taskDraftSchema = z.object({
  title: z.string().trim().min(1, 'Название задачи обязательно'),
  goalType: goalTypeSchema,
  target: z.coerce.number().positive('Цель должна быть больше 0'),
  unit: z.string().trim().optional().or(z.literal('')),
  weight: z.coerce.number().min(0, 'Вес ≥ 0').max(100, 'Вес ≤ 100'),
});
export type TaskDraft = z.infer<typeof taskDraftSchema>;

export const programDraftSchema = z.object({
  title: z.string().trim().min(1, 'Название программы обязательно'),
  period: periodSchema,
  tasks: z.array(taskDraftSchema).min(1, 'Добавьте хотя бы одну задачу'),
});
export type ProgramDraft = z.infer<typeof programDraftSchema>;

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Проверьте введённые данные';
}
