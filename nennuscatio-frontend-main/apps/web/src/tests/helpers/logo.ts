/** The file an image shows, whether next/image serves it through its optimiser address or as is. */
export function logoFile(image: Element): string {
  const url = new URL(image.getAttribute("src") ?? "", "http://localhost");
  return url.searchParams.get("url") ?? url.pathname;
}
