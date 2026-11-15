import { Suspense } from "react";
import { VerifyEmailPage } from "@/features/account/pages/VerifyEmailPage";
import "@/styles/account.css";

export default function Page() {
  return (
    <Suspense>
      <VerifyEmailPage />
    </Suspense>
  );
}
