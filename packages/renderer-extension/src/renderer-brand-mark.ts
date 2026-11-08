import boftBrandIconUrl from "./assets/codexhost-brand-icon.png";

/** BOFT product mark shared by settings and console headers. */
export function createRendererColoredBrandMark(ownerDocument: Document, size = 28): HTMLElement {
  const mark = ownerDocument.createElement("span");
  mark.className = "codexhost-colored-brand";
  mark.style.width = `${size}px`;
  mark.style.height = `${size}px`;
  mark.setAttribute("aria-hidden", "true");
  mark.setAttribute("data-codexhost-mark", "boft");

  const image = ownerDocument.createElement("img");
  image.className = "codexhost-colored-brand__image";
  image.src = boftBrandIconUrl;
  image.alt = "";
  image.draggable = false;
  mark.append(image);
  return mark;
}
