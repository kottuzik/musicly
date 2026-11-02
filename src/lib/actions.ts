// Shared result shape for form server actions.
export type ActionState = {
  ok?: boolean;
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  // A decision about this lesson failed (the lesson id from the database error detail).
  failedId?: string;
};
