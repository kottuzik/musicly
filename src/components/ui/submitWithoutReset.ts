import { startTransition, type FormEvent } from "react";

// React resets a <form action> after every submit, wiping what the user entered when the server
// returns an error. Submitting through onSubmit instead keeps the fields as they are.
export function submitWithoutReset(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  };
}
