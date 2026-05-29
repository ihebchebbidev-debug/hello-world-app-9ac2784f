import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/opportunites")({
  beforeLoad: () => {
    throw redirect({ to: "/opportunities" });
  },
});
