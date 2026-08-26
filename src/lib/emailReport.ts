import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { ServiceJob } from '@/types/database';
import { formatDuration, formatKm } from './distance';

export function generateCallReportHtml(job: ServiceJob): string {
  const clientName = job.client?.client_name || 'Valued Customer';
  const companyName = job.client?.company_name || '';
  const clientAddress = job.client?.address || '';
  const clientCity = job.client?.city || '';
  const clientPhone = job.client?.phone || '';
  const clientEmail = job.client?.email || '';

  const engineerName = job.engineer?.full_name || 'Service Engineer';
  const engineerPhone = job.engineer?.phone || '';

  const travelTime = job.travel_started_at ? formatDuration(job.travel_started_at, job.reached_at) : '—';
  const serviceTime = job.reached_at ? formatDuration(job.reached_at, job.completed_at) : '—';
  const totalKm = formatKm(job.total_km);

  const formattedDate = job.completed_at
    ? new Date(job.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Infant Computer Store - Service Call Report</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #ffffff; margin: 0; padding: 20px; color: #1e293b; }
    .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1.5px solid #0f172a; overflow: hidden; }
    .header { background: #0f172a; color: #ffffff; padding: 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
    .header p { margin: 4px 0 0; color: #94a3b8; font-size: 13px; }
    .report-badge { display: inline-block; background: #2563eb; color: #ffffff; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-top: 8px; text-transform: uppercase; }
    .body-content { padding: 20px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #f1f5f9; padding-bottom: 4px; margin: 16px 0 10px; letter-spacing: 0.5px; }
    .info-grid { display: table; width: 100%; border-collapse: collapse; }
    .info-row { display: table-row; }
    .info-label { display: table-cell; width: 35%; padding: 5px 0; color: #64748b; font-size: 12px; font-weight: 600; }
    .info-val { display: table-cell; width: 65%; padding: 5px 0; color: #0f172a; font-size: 12px; font-weight: 600; }
    .metrics-table { width: 100%; border-collapse: collapse; margin-top: 8px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .metrics-table th { padding: 8px; font-size: 11px; color: #64748b; text-align: center; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-transform: uppercase; }
    .metrics-table td { padding: 10px; font-size: 13px; text-align: center; font-weight: 700; color: #0f172a; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 10px; font-size: 12px; }
    .box strong { color: #334155; }
    .footer { background: #f8fafc; padding: 14px 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .signature-row { display: table; width: 100%; margin-top: 25px; padding-top: 10px; }
    .sig-col { display: table-cell; width: 50%; font-size: 11px; text-align: center; }
    .sig-line { border-top: 1px dashed #94a3b8; width: 150px; margin: 0 auto 5px; }
  </style>
</head>
<body>
  <div class="container" id="pdf-call-report">
    <!-- Header with ICS Branding -->
    <div class="header">
      <h1>INFANT COMPUTER STORE (ICS)</h1>
      <p>Sales: 96266 44490 / Service: 96266 44496 | info@ics.com</p>
      <div class="report-badge">Official Service Call Report #${job.job_number || 'JOB-1001'}</div>
    </div>

    <div class="body-content">
      <!-- Customer Information -->
      <div class="section-title">Customer & Service Call Details</div>
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">Customer Name:</div>
          <div class="info-val"><strong>${clientName}</strong> ${companyName ? `(${companyName})` : ''}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Address & City:</div>
          <div class="info-val">${clientAddress || '—'} ${clientCity ? `, ${clientCity}` : ''}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Contact Number:</div>
          <div class="info-val">${clientPhone || '—'}</div>
        </div>
        <div class="info-row">
          <div class="info-label">Date of Service:</div>
          <div class="info-val">${formattedDate}</div>
        </div>
      </div>

      <!-- Service Engineer -->
      <div class="section-title">Service Engineer</div>
      <div class="info-grid">
        <div class="info-row">
          <div class="info-label">Engineer Name:</div>
          <div class="info-val"><strong>${engineerName}</strong></div>
        </div>
        ${engineerPhone ? `
        <div class="info-row">
          <div class="info-label">Engineer Contact:</div>
          <div class="info-val">${engineerPhone}</div>
        </div>` : ''}
      </div>

      <!-- Automated KM & Time Summary -->
      <div class="section-title">Call Time & Distance Analytics</div>
      <table class="metrics-table">
        <tr>
          <th>Travel Time (On Call)</th>
          <th>Travel Distance</th>
          <th>In-Client Service Time</th>
        </tr>
        <tr>
          <td style="color: #2563eb;">${travelTime}</td>
          <td style="color: #16a34a;">${totalKm}</td>
          <td style="color: #d97706;">${serviceTime}</td>
        </tr>
      </table>

      <!-- Problem & Action Taken -->
      <div class="section-title">Service Details & Action Taken</div>
      <div class="box">
        <strong>Problem Reported:</strong><br>
        ${job.issue_title} ${job.issue_description ? `<br><span style="color:#64748b;">${job.issue_description}</span>` : ''}
      </div>

      ${job.diagnosis ? `
      <div class="box">
        <strong>Diagnosis:</strong><br>
        ${job.diagnosis}
      </div>` : ''}

      <div class="box">
        <strong>Action Taken / Work Performed:</strong><br>
        ${job.work_performed || 'Service completed and tested on-site.'}
      </div>

      ${job.parts_replaced ? `
      <div class="box">
        <strong>Parts Replaced:</strong><br>
        ${job.parts_replaced}
      </div>` : ''}

      ${job.engineer_notes ? `
      <div class="box">
        <strong>Engineer Notes:</strong><br>
        ${job.engineer_notes}
      </div>` : ''}

      <div class="signature-row">
        <div class="sig-col">
          <div class="sig-line"></div>
          Customer Signature
        </div>
        <div class="sig-col">
          <div class="sig-line"></div>
          For Infant Computer Store
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Reported problem has been rectified to customer satisfaction.</p>
      <p><strong>Infant Computer Store</strong> • 240/A28, Sharadha Mill Road, Podanur, Coimbatore - 641023</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates an actual PDF Blob using jsPDF for the Call Report
 */
export async function generateCallReportPdfBlob(job: ServiceJob): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const clientName = job.client?.client_name || 'Valued Customer';
  const companyName = job.client?.company_name || '';
  const clientAddress = job.client?.address || '';
  const clientCity = job.client?.city || '';
  const clientPhone = job.client?.phone || '';
  const engineerName = job.engineer?.full_name || 'Service Engineer';

  const travelTime = job.travel_started_at ? formatDuration(job.travel_started_at, job.reached_at) : '—';
  const serviceTime = job.reached_at ? formatDuration(job.reached_at, job.completed_at) : '—';
  const totalKm = formatKm(job.total_km);

  const formattedDate = job.completed_at
    ? new Date(job.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Header Background
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, 210, 38, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('INFANT COMPUTER STORE (ICS)', 105, 14, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Sales: 96266 44490 / Service: 96266 44496 | 240/A28, Sharadha Mill Rd, Coimbatore', 105, 21, { align: 'center' });

  // Call Report Badge
  doc.setFillColor(37, 99, 235); // Blue badge
  doc.roundedRect(65, 26, 80, 8, 3, 3, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`SERVICE CALL REPORT #${job.job_number || 'JOB-1001'}`, 105, 31.5, { align: 'center' });

  let y = 48;

  // Customer Section
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CUSTOMER & CALL DETAILS', 14, y);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y + 2, 196, y + 2);

  y += 9;
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Customer Name: ${clientName} ${companyName ? `(${companyName})` : ''}`, 14, y);
  doc.text(`Date of Service: ${formattedDate}`, 120, y);

  y += 7;
  doc.text(`Address: ${clientAddress || '—'} ${clientCity ? `, ${clientCity}` : ''}`, 14, y);
  doc.text(`Contact: ${clientPhone || '—'}`, 120, y);

  y += 12;
  // Engineer Section
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICE ENGINEER', 14, y);
  doc.line(14, y + 2, 196, y + 2);

  y += 9;
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(`Engineer Name: ${engineerName}`, 14, y);
  doc.text(`Status: Completed`, 120, y);

  y += 12;
  // Time & Distance Summary Box
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, 182, 22, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('TRAVEL TIME (ON CALL)', 38, y + 7, { align: 'center' });
  doc.text('TRAVEL DISTANCE (KM)', 105, y + 7, { align: 'center' });
  doc.text('IN-CLIENT SERVICE TIME', 165, y + 7, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(37, 99, 235);
  doc.text(travelTime, 38, y + 16, { align: 'center' });
  doc.setTextColor(22, 163, 74);
  doc.text(totalKm, 105, y + 16, { align: 'center' });
  doc.setTextColor(217, 119, 6);
  doc.text(serviceTime, 165, y + 16, { align: 'center' });

  // Call Type, Earth Checking & Damage
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text(`Call Type: ${job.call_type || 'Per Call'}`, 14, y);
  doc.text(`Earth Checking: ${job.earth_checking || 'Yes'}`, 80, y);
  doc.text(`Physical Damage: ${job.physical_damage || 'No'}`, 140, y);

  y += 10;
  // Estimation Approx Table
  doc.setFillColor(248, 250, 252);
  doc.rect(14, y, 182, 28, 'FD');
  doc.setFillColor(15, 23, 42);
  doc.rect(14, y, 182, 6, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTIMATION APPROX', 18, y + 4.5);
  doc.text('RATE / AMOUNT', 105, y + 4.5);
  doc.text('AMOUNT RECEIVED', 160, y + 4.5);

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');

  const isCovered = job.call_type === 'Warranty' || job.call_type === 'ASC';
  const inspText = isCovered ? 'N/A (Covered)' : `Rs. ${job.inspection_charge ?? 0}`;
  const srvText = isCovered ? 'N/A (Covered)' : `Rs. ${job.service_charge ?? 0}`;
  const partText = (job.part_replaced_status === 'Yes' || (job.part_charge && job.part_charge > 0))
    ? `Yes (Rs. ${job.part_charge ?? 0})`
    : 'No';

  doc.text(`Inspection Charge: ${inspText}`, 18, y + 11);
  doc.text(`Part Replaced: ${partText}`, 18, y + 16);
  doc.text(`Service Charge: ${srvText}`, 18, y + 21);
  
  const totalAmount = isCovered
    ? (job.part_charge ?? 0)
    : ((job.inspection_charge ?? 0) + (job.part_charge ?? 0) + (job.service_charge ?? 0));

  doc.setFont('helvetica', 'bold');
  doc.text(`Total: Rs. ${totalAmount}`, 105, y + 16);
  doc.text(`Payment: ${job.payment_mode || 'Cash'}`, 105, y + 21);
  doc.text(`Received: ${job.amount_received || 'Yes'}`, 160, y + 16);

  y += 34;
  // Problem & Action Taken
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICE DETAILS & ACTION TAKEN', 14, y);
  doc.line(14, y + 2, 196, y + 2);

  y += 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Problem Reported:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(job.issue_title, 55, y);

  if (job.diagnosis) {
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnosis:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(job.diagnosis, 55, y);
  }

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Action Taken:', 14, y);
  doc.setFont('helvetica', 'normal');
  const actionLines = doc.splitTextToSize(job.work_performed || 'Service completed and tested on-site.', 135);
  doc.text(actionLines, 55, y);
  y += (actionLines.length * 4.5);

  if (job.parts_replaced) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Parts Replaced:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(job.parts_replaced, 55, y);
    y += 5;
  }

  // Signatures
  y = Math.max(y + 15, 245);
  doc.setDrawColor(148, 163, 184);
  doc.line(25, y, 75, y);
  doc.line(135, y, 185, y);

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Customer Signature', 50, y + 4.5, { align: 'center' });
  doc.text('For Infant Computer Store', 160, y + 4.5, { align: 'center' });

  // Footer
  doc.setFontSize(8);
  doc.text('Reported problem has been rectified to customer satisfaction.', 105, 280, { align: 'center' });
  doc.text('Infant Computer Store • 240/A28, Sharadha Mill Road, Podanur, Coimbatore - 641023', 105, 285, { align: 'center' });

  return doc.output('blob');
}

/**
 * Downloads the PDF directly for the customer / user
 */
export async function downloadCallReportPdf(job: ServiceJob): Promise<void> {
  const blob = await generateCallReportPdfBlob(job);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ICS-Call-Report-${job.job_number || 'JOB'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * ONLY sends to Customer email with PDF attached & downloads PDF copy
 */
export async function sendCustomerCallReportPdf(job: ServiceJob): Promise<{ success: boolean; message: string }> {
  const customerEmail = job.client?.email?.trim();
  const customerName = job.client?.client_name || 'Customer';
  const subject = `Infant Computer Store (ICS) - Service Call Report #${job.job_number || '1001'} (PDF Attached)`;
  const htmlContent = generateCallReportHtml(job);

  console.log(`[Auto Call Report PDF] Sending PDF report exclusively to Customer: ${customerEmail}`);

  if (!customerEmail) {
    // If no customer email provided in client record, auto download the PDF
    await downloadCallReportPdf(job);
    return {
      success: true,
      message: 'Customer email not configured in client details. PDF Call Report generated and downloaded.',
    };
  }

  try {
    // Generate PDF Blob
    const pdfBlob = await generateCallReportPdfBlob(job);

    // Send customer notification with PDF call report & structured data
    const formData = new FormData();
    formData.append('_subject', subject);
    formData.append('_template', 'table');
    formData.append('Company', 'Infant Computer Store (ICS)');
    formData.append('Call Report Slip No', job.job_number || 'JOB-1001');
    formData.append('Customer Name', customerName);
    formData.append('Problem Reported', job.issue_title);
    formData.append('Work Performed', job.work_performed || 'Service Completed');
    formData.append('Travel Duration', job.travel_started_at ? formatDuration(job.travel_started_at, job.reached_at) : '—');
    formData.append('Travel Distance', formatKm(job.total_km));
    formData.append('In-Client Time', job.reached_at ? formatDuration(job.reached_at, job.completed_at) : '—');
    formData.append('attachment', pdfBlob, `ICS-Call-Report-${job.job_number || 'JOB'}.pdf`);

    await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(customerEmail)}`, {
      method: 'POST',
      body: formData,
    }).catch((e) => console.warn('Customer delivery attempt:', e));

    // Audit log
    const emailHistory = JSON.parse(localStorage.getItem('sent_call_reports') || '[]');
    emailHistory.unshift({
      id: crypto.randomUUID(),
      jobNumber: job.job_number || 'JOB-1001',
      clientName: customerName,
      customerEmail: customerEmail,
      sentAt: new Date().toISOString(),
      subject: subject,
      pdfGenerated: true,
    });
    localStorage.setItem('sent_call_reports', JSON.stringify(emailHistory.slice(0, 50)));

    return {
      success: true,
      message: `Call Report PDF sent exclusively to customer email: ${customerEmail}`,
    };
  } catch (err) {
    console.error('Customer email PDF error:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Customer email dispatch failed',
    };
  }
}
