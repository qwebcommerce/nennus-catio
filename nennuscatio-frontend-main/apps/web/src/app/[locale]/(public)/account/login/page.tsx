import { Suspense } from "react";
import { LoginPage } from "@/features/account/pages/LoginPage";
import "@/styles/account.css";

export default function Page() {
  // The page reads `?next=` (useSearchParams), which Next.js renders in the browser behind a Suspense boundary.
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
