import { Suspense } from "react";
import { ResetPasswordPage } from "@/features/account/pages/ResetPasswordPage";

export default function Page() {
  return (
    <Suspense>
      <ResetPasswordPage staff />
    </Suspense>
  );
}
