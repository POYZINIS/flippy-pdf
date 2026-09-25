// A tiny, real PDF with an xref table, so tests exercise PDF.js and its worker.
export function pdfFile(name = 'Reading notes.pdf', count = 4, padding = 0) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let i = 0; i < count; i++) {
    const stream = `0.96 0.96 0.92 rg 0 0 420 594 re f\n0.2 0.35 0.25 rg\nBT /F1 28 Tf 44 500 Td (A little room to read.) Tj 0 -50 Td /F1 14 Tf (Page ${i + 1}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 594] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  // An unreferenced stream lets range-loading tests detect whole-file reads.
  if (padding) objects.push(`<< /Length ${padding} >>\nstream\n${' '.repeat(padding)}\nendstream`);
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(pdf) };
}


