function sanitizeFileName(value) {
  const cleaned = String(value || 'hotel-dashboard')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  return cleaned || 'hotel-dashboard';
}

let cachedDeps = null;

async function loadPdfDeps() {
  if (cachedDeps) return cachedDeps;

  const [html2canvasModule, jspdfModule] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm'),
    import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'),
  ]);

  const html2canvas = html2canvasModule.default || html2canvasModule;
  const jsPDF = jspdfModule.jsPDF || jspdfModule.default?.jsPDF;

  if (!html2canvas || !jsPDF) {
    throw new Error('Unable to load PDF exporter modules.');
  }

  cachedDeps = { html2canvas, jsPDF };
  return cachedDeps;
}

function renderPdfFromCanvas(canvas, jsPDF, hotelName) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imageData = canvas.toDataURL('image/jpeg', 0.92);

  let rendered = 0;
  let first = true;
  while (rendered < imgHeight) {
    if (!first) pdf.addPage();
    pdf.addImage(imageData, 'JPEG', 0, -rendered, imgWidth, imgHeight, undefined, 'FAST');
    rendered += pageHeight;
    first = false;
  }

  const fileName = `${sanitizeFileName(hotelName)}-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`;
  pdf.save(fileName);
}

export async function downloadDashboardPdf(dashboard, hotelName = '') {
  if (!dashboard) {
    throw new Error('Load dashboard first, then export PDF.');
  }

  const target = document.getElementById('hotel-dashboard-panel');
  if (!target) {
    throw new Error('Dashboard panel not found for export.');
  }

  const { html2canvas, jsPDF } = await loadPdfDeps();

  document.body.classList.add('pdf-exporting');

  let canvas;
  try {
    canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#f8fafc',
      logging: false,
      windowWidth: Math.max(document.documentElement.clientWidth, target.scrollWidth),
      windowHeight: Math.max(document.documentElement.clientHeight, target.scrollHeight),
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    document.body.classList.remove('pdf-exporting');
  }

  const sourceName = hotelName || dashboard?.competitiveGrid?.[0]?.name || dashboard?.hotelId || 'hotel-dashboard';

  try {
    renderPdfFromCanvas(canvas, jsPDF, sourceName);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('insecure')) {
      throw new Error(
        'Browser blocked secure canvas export. Please open over localhost/https and retry.',
      );
    }
    throw error;
  }
}
