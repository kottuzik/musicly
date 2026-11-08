"use client";

import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = "input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]";

// After a submit comes back with errors, move focus to the first invalid field (or, when no field
// is invalid, to the form's error message) so screen reader users hear what went wrong.
// WCAG 3.3.1 / 4.1.3. Pass the form's action state: it is a new object on every response, so the
// check runs even when the same errors come back twice. Focus moves only after a submit, never
// while the user is typing and errors clear one by one.
export function useFocusFirstError(state: unknown) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const submitted = useRef(false);

  // A callback ref, so a form that is re-created (e.g. with a new key) gets the listener too.
  // A listener on the form itself runs before React's root-level submit handling.
  const ref = useCallback((form: HTMLFormElement | null) => {
    formRef.current = form;
    if (!form) return;
    const onSubmit = () => {
      submitted.current = true;
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!submitted.current || !form) return;
    submitted.current = false;
    const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    // A group (e.g. radio choices) is marked invalid as a whole: focus its first control.
    const target = invalid?.matches(FOCUSABLE) ? invalid : (invalid?.querySelector<HTMLElement>(FOCUSABLE) ?? form.querySelector<HTMLElement>('[role="alert"]'));
    target?.focus();
  }, [state]);

  return ref;
}
