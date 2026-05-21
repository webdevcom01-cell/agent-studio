import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

function isRlsViolation(event: Sentry.ErrorEvent): boolean {
  return (
    event.exception?.values?.some(
      (ex) =>
        ex.value?.includes("42501") ||
        ex.value?.toLowerCase().includes("row-level security") ||
        ex.value?.toLowerCase().includes("insufficient privilege")
    ) ?? false
  );
}

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.2,
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === "production",
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers["cookie"];
        delete event.request.headers["authorization"];
      }

      if (isRlsViolation(event)) {
        event.fingerprint = ["rls-policy-violation-42501"];
        event.tags = {
          ...event.tags,
          rls_violation: "true",
          sqlstate: "42501",
        };
        event.level = "fatal";
      }

      return event;
    },
  });
}
