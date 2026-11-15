import { Suspense } from "react";
import { ResetPasswordPage } from "@/features/account/pages/ResetPasswordPage";
import "@/styles/account.css";

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  );
}
