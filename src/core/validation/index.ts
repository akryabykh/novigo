// zod schemas — input validation for the auth screens. Goal/task shape is
// validated inside HorizonEditor (with live remaining-% feedback) and, on the
// server, by save_horizon + CHECK constraints (migration 0007), so no goal-draft
// schema lives here anymore.
import { z } from 'zod';

export const emailSchema = z.string().trim().min(1, 'Введите email').email('Некорректный email');
export const passwordSchema = z.string().min(8, 'Минимум 8 символов');

export const nameSchema = z.object({
  firstName: z.string().trim().min(1, 'Имя обязательно'),
  lastName: z.string().trim().optional().or(z.literal('')),
  middleName: z.string().trim().optional().or(z.literal('')),
});
