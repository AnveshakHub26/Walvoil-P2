import * as pdfjsLib from 'pdfjs-dist';

// Use the bundled or CDN worker for pdf.js
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

/**
 * Extracts all pages of a PDF file as individual high-resolution JPEG File objects.
 * Scale 2.2 renders standard A4 sheets at ~1700x2400px (ideal for Gemini Vision).
 */
export async function extractPagesFromPdf(
  pdfFile: File,
  onProgress?: (currentPage: number, totalPages: number) => void
): Promise<File[]> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pageFiles: File[] = [];

  const baseName = pdfFile.name.replace(/\.[^/.]+$/, '').trim() || 'DPR_Report';

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    if (onProgress) {
      onProgress(pageNum, totalPages);
    }

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.2 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      continue;
    }

    // White background for scanned sheets
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Render PDF page into canvas
    await page.render({
      canvas: canvas,
      canvasContext: context,
      viewport,
    }).promise;

    // Convert canvas to JPEG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88);
    });

    if (blob) {
      const pageFileName = `${baseName}_Page_${pageNum}.jpg`;
      const pageFile = new File([blob], pageFileName, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      pageFiles.push(pageFile);
    }

    // Clean up canvas
    canvas.width = 0;
    canvas.height = 0;
  }

  return pageFiles;
}
