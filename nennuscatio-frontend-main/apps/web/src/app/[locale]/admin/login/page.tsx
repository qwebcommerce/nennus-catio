import { Suspense } from "react";
import { StaffLoginPage } from "@/features/admin/auth/pages/StaffLoginPage";

export default function Page() {
  return (
    <Suspense>
      <StaffLoginPage />
    </Suspense>
  );
}
