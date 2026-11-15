// Contact links are configuration, not messaging integration. Never include guest data.
export function whatsappLink(value: string, message?: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null;
    let phone: string;
    if (url.hostname === "wa.me" && /^\/[1-9]\d{7,14}$/.test(url.pathname))
      phone = url.pathname.slice(1);
    else if (url.hostname === "api.whatsapp.com" && url.pathname === "/send")
      phone = url.searchParams.get("phone") ?? "";
    else return null;
    if (!/^[1-9]\d{7,14}$/.test(phone)) return null;
    const result = new URL(`https://wa.me/${phone}`);
    const text = message ?? url.searchParams.get("text");
    if (text) result.searchParams.set("text", text.slice(0, 500));
    return result.toString();
  } catch {
    return null;
  }
}
