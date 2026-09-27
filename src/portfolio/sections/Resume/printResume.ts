/**
 * Prints just the HTML resume page: clones it (unscaled) into a hidden iframe together with the
 * page's stylesheets, so the browser's "Save as PDF" produces a clean one-page resume.
 */
export async function printResumePage(source: HTMLElement, title: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', opacity: '0' });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }
  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();
  doc.title = title;

  // Same stylesheets as the host page (dev: <style> tags, prod: <link> tags) so CSS-module classes resolve.
  const loads: Promise<void>[] = [];
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    if (clone instanceof HTMLLinkElement) {
      loads.push(
        new Promise((res) => {
          clone.onload = () => res();
          clone.onerror = () => res();
        }),
      );
    }
    doc.head.appendChild(doc.importNode(clone, true));
  });
  const print = doc.createElement('style');
  print.textContent = `
    @page { size: letter; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #000; min-height: 0 !important; }
    body { background-image: none !important; }
    [data-resume-page] { background: #fff !important; box-shadow: none !important; transform: none !important; margin: 0 auto; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;
  doc.head.appendChild(print);

  const page = doc.importNode(source, true) as HTMLElement;
  page.style.transform = 'none';
  doc.body.appendChild(page);

  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]);
  try {
    await Promise.race([doc.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]);
  } catch {
    /* fonts API unavailable */
  }

  const cleanup = () => window.setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => iframe.isConnected && iframe.remove(), 120_000);
  win.focus();
  win.print();
}
