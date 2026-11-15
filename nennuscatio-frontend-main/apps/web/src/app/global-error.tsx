"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            maxWidth: 600,
            margin: "4rem auto",
            padding: 24,
            fontFamily: "sans-serif",
          }}
        >
          <h1>Nennus Catio — preview unavailable</h1>
          <p>No purchase or booking has been submitted.</p>
          <p lang="ar" dir="rtl">
            تعذّرت المعاينة. لم يُرسل أي طلب أو حجز.
          </p>
          <button type="button" onClick={reset}>
            Try again / حاول مجدداً
          </button>
        </main>
      </body>
    </html>
  );
}
