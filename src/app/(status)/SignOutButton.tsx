import { Button } from "@/components/ui/Button";

export function SignOutButton({ variant = "outline" }: { variant?: "primary" | "outline" }) {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant={variant} fullWidth>
        יציאה
      </Button>
    </form>
  );
}
