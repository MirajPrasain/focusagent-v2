// Document Picture-in-Picture: a small always-on-top window the page can render into. Chrome and Edge 116+ only;
// TypeScript's DOM types don't include it yet.
declare global {
  interface DocumentPictureInPicture extends EventTarget {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
    readonly window: Window | null;
  }
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export const pipSupported = () => 'documentPictureInPicture' in window;

// Copies the page's stylesheets into the PiP window, so the same Tailwind classes work there
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = target.createElement('style');
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n');
      target.head.appendChild(style);
    } catch {
      // Rules of a cross-origin sheet can't be read: link it instead
      if (!sheet.href) continue;
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.head.appendChild(link);
    }
  }
}

// Opens the PiP window with the page's styles. Must run from a user gesture (a click)
export async function openPipWindow(width: number, height: number): Promise<Window> {
  const pip = await window.documentPictureInPicture!.requestWindow({ width, height });
  copyStyles(pip.document);
  pip.document.title = document.title;
  return pip;
}
