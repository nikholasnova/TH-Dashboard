export async function svgContainerToPng(
  container: HTMLElement,
  filename: string,
  scale = 2,
): Promise<void> {
  const svg = container.querySelector('svg');
  if (!svg) return;

  const clone = svg.cloneNode(true) as SVGElement;
  const computed = getComputedStyle(container);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Inline critical styles so exported image isn't blank
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    text, tspan { fill: ${computed.color}; font-family: ${computed.fontFamily}; }
    line, path { vector-effect: non-scaling-stroke; }
  `;
  clone.prepend(styleEl);

  // Inline all text fill colors from the live DOM
  const liveTexts = svg.querySelectorAll('text');
  const cloneTexts = clone.querySelectorAll('text');
  liveTexts.forEach((el, i) => {
    const target = cloneTexts[i];
    if (!target) return;
    const style = getComputedStyle(el);
    target.setAttribute('fill', style.fill || style.color);
    target.style.fontSize = style.fontSize;
  });

  const svgRect = svg.getBoundingClientRect();
  const w = svgRect.width * scale;
  const h = svgRect.height * scale;

  clone.setAttribute('width', String(svgRect.width));
  clone.setAttribute('height', String(svgRect.height));

  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = computed.backgroundColor || '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) { resolve(); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pngBlob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        resolve();
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    img.src = url;
  });
}
