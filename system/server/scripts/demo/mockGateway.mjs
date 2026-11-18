/**
 * In-process stand-in for the SkipCash API, used only by the demo loader so that no real payment
 * is ever created: create (POST /), refund (POST /refund), lookup (GET /:id, signed).
 */
import http from "http";
import crypto from "crypto";

export async function startMockGateway({ secret, keyId }) {
  const payments = new Map();
  let n = 0;
  const sign = (id) => crypto.createHmac("sha256", secret).update(`Id=${id},KeyId=${keyId}`).digest("base64");
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      const url = new URL(req.url, "http://localhost");
      n += 1;
      if (req.method === "POST" && url.pathname.endsWith("/refund")) {
        return res.end(JSON.stringify({ resultObj: { id: `DEMO-REF-${n}` } }));
      }
      if (req.method === "POST") {
        let p = {};
        try {
          p = JSON.parse(body || "{}");
        } catch {
          /* empty */
        }
        const id = `DEMO-PAY-${crypto.randomBytes(6).toString("hex")}`;
        payments.set(id, { id, statusId: 1, amount: p.Amount, currency: "QAR", transactionId: p.TransactionId, custom1: p.Custom1 });
        return res.end(JSON.stringify({ resultObj: { id, payUrl: `https://pay.example.com/demo/${id}` } }));
      }
      if (req.method === "GET") {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        const row = payments.get(id);
        if (req.headers.authorization !== sign(id) || !row) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ hasError: true, errorMessage: "not found" }));
        }
        return res.end(JSON.stringify({ resultObj: row, returnCode: 200, hasError: false }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    /** The payment the app created for this order / booking (Custom1). */
    byCustom(custom1) {
      for (const row of payments.values()) if (row.custom1 === custom1) return row;
      return null;
    },
    setStatus(id, statusId) {
      const row = payments.get(id);
      if (row) row.statusId = statusId;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
