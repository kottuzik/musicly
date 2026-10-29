import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

const email = z
  .string()
  .trim()
  .min(1, "יש להזין כתובת אימייל")
  .pipe(z.email("כתובת האימייל אינה תקינה"));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "יש להזין סיסמה"),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `הסיסמה צריכה להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`),
    confirmPassword: z.string().min(1, "יש להזין שוב את הסיסמה"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "הסיסמאות אינן תואמות",
  });

// Maps Zod issues to the first message per field.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
