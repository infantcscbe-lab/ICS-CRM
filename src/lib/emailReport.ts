import jsPDF from 'jspdf';
import type { ServiceJob } from '@/types/database';
import { formatDuration, formatKm } from './distance';

export interface CallReportOptions {
  includeTravelMetrics?: boolean;
}

export function generateCallReportHtml(job: ServiceJob, options: CallReportOptions = {}): string {
  const clientName = job.client?.client_name || 'Valued Customer';
  const companyName = job.client?.company_name || '';
  const clientAddress = job.client?.address || '';
  const clientCity = job.client?.city || '';
  const clientPhone = job.client?.phone || '';
  const clientEmail = job.client?.email || '';

  const engineerName = job.engineer?.full_name || 'Service Engineer';
  const engineerPhone = job.engineer?.phone || '';
  const assistEngineerName = job.is_assist_call && job.assist_engineer?.full_name ? job.assist_engineer.full_name : '';
  const assistEngineerPhone = job.is_assist_call && job.assist_engineer?.phone ? job.assist_engineer.phone : '';

  const travelTime = job.travel_started_at ? formatDuration(job.travel_started_at, job.reached_at) : '—';
  const serviceTime = job.reached_at ? formatDuration(job.reached_at, job.completed_at) : '—';
  const totalKm = formatKm(job.total_km);

  const formattedDate = job.completed_at
    ? new Date(job.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const isCovered = job.call_type === 'Warranty' || job.call_type === 'ASC';
  const inspFee = isCovered ? 0 : (job.inspection_charge ?? 0);
  const partFee = (job.part_replaced_status === 'Yes' || (job.part_charge && job.part_charge > 0)) ? (job.part_charge ?? 0) : 0;
  const servFee = isCovered ? 0 : (job.service_charge ?? 0);
  const totalAmount = isCovered ? partFee : (inspFee + partFee + servFee);

  const includeTravel = options.includeTravelMetrics ?? false;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Infant Computer Store - Service Call Report #${job.job_number || 'JOB-1001'}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; line-height: 1.5; }
    .container { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1.5px solid #0f172a; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); }
    .header { background: #0f172a; color: #ffffff; padding: 22px 24px; position: relative; border-bottom: 3px solid #2563eb; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px; }
    .header .tagline { margin: 3px 0 0; color: #94a3b8; font-size: 11.5px; }
    .header .address { margin: 4px 0 0; color: #cbd5e1; font-size: 11px; }
    .report-badge { display: inline-block; background: #2563eb; color: #ffffff; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-top: 10px; letter-spacing: 0.5px; text-transform: uppercase; }
    .body-content { padding: 22px 24px; }
    
    .section-title { font-size: 11.5px; font-weight: 800; text-transform: uppercase; color: #475569; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; margin: 18px 0 10px; letter-spacing: 0.6px; }
    
    .cards-grid { display: table; width: 100%; border-collapse: separate; border-spacing: 12px 0; margin: 0 -12px; }
    .card-col { display: table-cell; width: 50%; vertical-align: top; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .card-title { font-size: 10px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .card-content { font-size: 12px; color: #334155; }
    .card-content strong { color: #0f172a; }
    .card-row { margin-bottom: 5px; }
    .card-row:last-child { margin-bottom: 0; }
    
    .metrics-table { width: 100%; border-collapse: collapse; margin: 10px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .metrics-table th { padding: 8px 10px; font-size: 10px; color: #64748b; text-align: center; border-bottom: 1px solid #e2e8f0; font-weight: 700; text-transform: uppercase; }
    .metrics-table td { padding: 10px; font-size: 13px; text-align: center; font-weight: 700; color: #0f172a; }

    .tech-strip { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin: 12px 0; display: table; width: 100%; box-sizing: border-box; }
    .tech-item { display: table-cell; width: 33.33%; font-size: 11.5px; vertical-align: top; }
    .tech-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
    .tech-val { font-weight: 700; color: #0f172a; }
    
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; font-size: 12px; }
    .box-title { font-weight: 800; color: #475569; font-size: 10.5px; text-transform: uppercase; margin-bottom: 4px; }
    .box-desc { color: #0f172a; line-height: 1.5; }
    
    .billing-table { width: 100%; border-collapse: collapse; margin-top: 8px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .billing-table th { background: #0f172a; color: #ffffff; padding: 8px 12px; font-size: 10.5px; text-align: left; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    .billing-table td { padding: 8px 12px; font-size: 12px; color: #334155; border-bottom: 1px solid #f1f5f9; }
    .billing-table tr:last-child td { border-bottom: none; }
    .billing-total { background: #f8fafc; font-weight: 800; color: #0f172a; }
    
    .declaration { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #64748b; font-style: italic; margin-top: 16px; }
    
    .signature-row { display: table; width: 100%; margin-top: 30px; padding-top: 10px; }
    .sig-col { display: table-cell; width: 50%; font-size: 11px; text-align: center; color: #475569; font-weight: 600; }
    .sig-line { border-top: 1px dashed #94a3b8; width: 160px; margin: 0 auto 6px; }
    
    .footer { background: #f8fafc; padding: 16px 20px; text-align: center; font-size: 10.5px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .footer p { margin: 2px 0; }
  </style>
</head>
<body>
  <div class="container" id="pdf-call-report">
    <!-- Header with ICS Branding -->
    <div class="header">
      <h1>INFANT COMPUTER STORE (ICS)</h1>
      <div class="tagline">Total IT Hardware Solutions • Chip-Level Service • Networking • AMC Contracts</div>
      <div class="address">240/A2B, Sarada Mill Road, Near Koushikha Hospital, Podanur, Coimbatore - 641023</div>
      <div class="address">Support: +91 96266 44496 / 96266 44490  |  Email: info@ics.com</div>
      <div class="report-badge">Official Service Call Report #${job.job_number || 'JOB-1001'}</div>
    </div>

    <div class="body-content">
      <!-- Two Column Cards: Customer & Service Call Details -->
      <div class="cards-grid">
        <div class="card-col">
          <div class="card-title">Customer / Client Details</div>
          <div class="card-content">
            <div class="card-row"><strong>${clientName}</strong> ${companyName && companyName !== clientName ? `<br><span style="color:#64748b;">${companyName}</span>` : ''}</div>
            <div class="card-row">${clientAddress || '—'} ${clientCity ? `, ${clientCity}` : ''}</div>
            <div class="card-row"><strong>Phone:</strong> ${clientPhone || '—'}</div>
            ${clientEmail ? `<div class="card-row"><strong>Email:</strong> ${clientEmail}</div>` : ''}
            ${job.call_given_by ? `<div class="card-row"><strong>Caller:</strong> ${job.call_given_by}</div>` : ''}
          </div>
        </div>
        
        <div class="card-col">
          <div class="card-title">Service & Engineer Assignment</div>
          <div class="card-content">
            <div class="card-row"><strong>Job Slip No:</strong> #${job.job_number || 'JOB-1001'}</div>
            <div class="card-row"><strong>Service Date:</strong> ${formattedDate}</div>
            <div class="card-row"><strong>Call Type:</strong> <span style="color:#2563eb; font-weight:700;">${job.call_type || 'Per Call'}</span></div>
            <div class="card-row"><strong>Lead Engineer:</strong> ${engineerName} ${engineerPhone ? `(${engineerPhone})` : ''}</div>
            ${assistEngineerName ? `<div class="card-row"><strong>Assist Engineer:</strong> ${assistEngineerName} (Assist Call)</div>` : ''}
            <div class="card-row"><strong>Service Status:</strong> <span style="color:#16a34a; font-weight:700;">Completed ✓</span></div>
          </div>
        </div>
      </div>

      ${includeTravel ? `
      <!-- Trip & Field Service Analytics (Included for Internal Slip / Admin Print) -->
      <div class="section-title">Trip & Field Service Analytics</div>
      <table class="metrics-table">
        <tr>
          <th>Travel Duration (On Call)</th>
          <th>Travel Distance (KM)</th>
          <th>In-Client Service Time</th>
        </tr>
        <tr>
          <td style="color: #2563eb;">${travelTime}</td>
          <td style="color: #16a34a;">${totalKm}</td>
          <td style="color: #d97706;">${serviceTime}</td>
        </tr>
      </table>` : ''}

      <!-- Equipment & Technical Parameters Strip -->
      <div class="tech-strip">
        <div class="tech-item">
          <div class="tech-label">Problem Device / ID</div>
          <div class="tech-val">${job.device_id || 'Client Equipment / Device'}</div>
        </div>
        <div class="tech-item">
          <div class="tech-label">Earth Voltage Checking</div>
          <div class="tech-val" style="color: ${job.earth_checking === 'No' ? '#dc2626' : '#16a34a'};">
            ${job.earth_checking || 'Yes'} (Normal)
          </div>
        </div>
        <div class="tech-item">
          <div class="tech-label">Physical Condition</div>
          <div class="tech-val" style="color: ${job.physical_damage === 'Yes' ? '#dc2626' : '#16a34a'};">
            ${job.physical_damage === 'Yes' ? 'Damage / Scratch Noted' : 'Clean (No Physical Damage)'}
          </div>
        </div>
      </div>

      <!-- Service Details & Technical Actions Taken -->
      <div class="section-title">Technical Service Details & Actions Taken</div>
      
      <div class="box">
        <div class="box-title">Problem Reported by Customer:</div>
        <div class="box-desc"><strong>${job.issue_title}</strong>${job.issue_description ? `<br><span style="color:#475569;">${job.issue_description}</span>` : ''}</div>
      </div>

      <div class="box">
        <div class="box-title">Diagnosis & Root Cause Analysis:</div>
        <div class="box-desc">${job.diagnosis || 'Thorough hardware/software diagnostics conducted on-site.'}</div>
      </div>

      <div class="box">
        <div class="box-title">Action Taken / Work Performed:</div>
        <div class="box-desc">${job.work_performed || 'Service completed, verified, and tested on-site.'}</div>
      </div>

      ${job.parts_replaced ? `
      <div class="box">
        <div class="box-title">Spare Parts Replaced / Software Installed:</div>
        <div class="box-desc">${job.parts_replaced}</div>
      </div>` : ''}

      ${job.engineer_notes ? `
      <div class="box">
        <div class="box-title">Engineer Observations & Recommendations:</div>
        <div class="box-desc">${job.engineer_notes}</div>
      </div>` : ''}

      <!-- Commercial & Charges Breakdown Table -->
      <div class="section-title">Commercials & Service Charges Breakdown</div>
      <table class="billing-table">
        <thead>
          <tr>
            <th style="width: 50%;">Description</th>
            <th style="width: 30%;">Category / Status</th>
            <th style="width: 20%; text-align: right;">Amount (INR)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1. Diagnostic & Inspection Fee</td>
            <td>${isCovered ? '<span style="color:#16a34a; font-weight:700;">Covered under Warranty / AMC</span>' : 'Standard On-site Diagnostic'}</td>
            <td style="text-align: right; font-weight: 600;">₹${inspFee}</td>
          </tr>
          <tr>
            <td>2. Spare Parts & Hardware Components</td>
            <td>${partFee > 0 ? (job.parts_replaced || 'Replacement Part') : 'No Chargeable Parts'}</td>
            <td style="text-align: right; font-weight: 600;">₹${partFee}</td>
          </tr>
          <tr>
            <td>3. Technical Service & Labor Charges</td>
            <td>${isCovered ? '<span style="color:#16a34a; font-weight:700;">Covered under Warranty / AMC</span>' : 'Field Technical Labor'}</td>
            <td style="text-align: right; font-weight: 600;">₹${servFee}</td>
          </tr>
          <tr class="billing-total">
            <td colspan="2" style="font-size: 13px; font-weight: 800;">
              Total Amount Payable: <span style="color: #16a34a; font-size: 14px;">₹${totalAmount}</span>
              <span style="font-weight: normal; font-size: 11px; color: #64748b; margin-left: 12px;">(${job.payment_mode || 'Cash'} • Received: ${job.amount_received || 'Yes'})</span>
            </td>
            <td style="text-align: right; font-size: 14px; color: #16a34a; font-weight: 800;">₹${totalAmount}</td>
          </tr>
        </tbody>
      </table>

      <!-- Customer Declaration -->
      <div class="declaration">
        Customer Acknowledgement: I / We hereby acknowledge that the service described above has been carried out to our complete satisfaction and the equipment has been verified, tested, and handed over in satisfactory working condition.
      </div>

      <!-- Signatures -->
      <div class="signature-row">
        <div class="sig-col">
          <div class="sig-line"></div>
          Customer Signature & Seal
        </div>
        <div class="sig-col">
          <div class="sig-line"></div>
          For Infant Computer Store (Engineer)
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p><strong>Infant Computer Store</strong> • 240/A2B, Sarada Mill Road, Near Koushikha Hospital, Podanur, Coimbatore - 641023</p>
      <p>Warranty Terms: 30 days service warranty on workmanship. Physical damage, liquid spill, or electrical surges are excluded.</p>
      <p style="color: #94a3b8; font-size: 9.5px; margin-top: 4px;">This is an authentic computer-generated service call report.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates an executive-grade, detailed PDF document using jsPDF
 * includeTravelMetrics:
 * - true for Download PDF / View Slip (includes Travel Duration, Travel KM, In-Client Service Time)
 * - false for Send Customer PDF (excludes Travel Duration, Travel KM, In-Client Service Time)
 */
export async function generateCallReportPdfBlob(job: ServiceJob, options: CallReportOptions = { includeTravelMetrics: true }): Promise<Blob> {
  const includeTravel = options.includeTravelMetrics ?? true;

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
  const clientEmail = job.client?.email || '';

  const engineerName = job.engineer?.full_name || 'Service Engineer';
  const engineerPhone = job.engineer?.phone || '';
  const assistEngineerName = job.is_assist_call && job.assist_engineer?.full_name ? job.assist_engineer.full_name : '';
  const assistEngineerPhone = job.is_assist_call && job.assist_engineer?.phone ? job.assist_engineer.phone : '';

  const travelTime = job.travel_started_at ? formatDuration(job.travel_started_at, job.reached_at) : '—';
  const serviceTime = job.reached_at ? formatDuration(job.reached_at, job.completed_at) : '—';
  const totalKm = formatKm(job.total_km);

  const formattedDate = job.completed_at
    ? new Date(job.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // 1. Top Header Banner (0 to 36mm)
  doc.setFillColor(15, 23, 42); // #0f172a (deep corporate slate)
  doc.rect(0, 0, 210, 36, 'F');
  doc.setFillColor(37, 99, 235); // Accent line
  doc.rect(0, 36, 210, 1.5, 'F');

  // Company Brand Left
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('INFANT COMPUTER STORE (ICS)', 14, 12);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text('Total IT Hardware Solutions • Chip-Level Service • Networking • AMC Contracts', 14, 18);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('240/A2B, Sarada Mill Road, Near Koushikha Hospital, Podanur, Coimbatore - 641023', 14, 23.5);
  doc.text('Support: +91 96266 44496 / 96266 44490  |  Email: info@ics.com', 14, 28.5);

  // Call Report Badge Right
  doc.setFillColor(37, 99, 235);
  doc.roundedRect(138, 7.5, 58, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('SERVICE CALL REPORT', 167, 12.3, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(`NO: ${job.job_number || 'JOB-1001'}`, 196, 20.5, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(`Service Date: ${formattedDate}`, 196, 26, { align: 'right' });
  doc.text(`Call Type: ${job.call_type || 'Per Call'}`, 196, 31, { align: 'right' });

  let y = 43;

  // 2. Two-Column Information Cards
  // Left Box: Customer Details (X = 14, width = 88mm)
  // Right Box: Service & Engineer Details (X = 108, width = 88mm)
  const boxHeight = 44;

  // Left Box (Customer)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, 88, boxHeight, 2, 2, 'FD');

  // Left Box Header Strip
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 88, 7, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('CUSTOMER / CLIENT DETAILS', 18, y + 4.8);

  // Left Box Content - Text bounded within 80mm so no overlapping ever occurs
  let leftY = y + 11.5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(clientName, 80);
  doc.text(nameLines.slice(0, 2), 18, leftY);
  leftY += Math.min(nameLines.length, 2) * 4;

  if (companyName && companyName !== clientName) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const compLines = doc.splitTextToSize(companyName, 80);
    doc.text(compLines.slice(0, 1), 18, leftY);
    leftY += 3.5;
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  const fullAddress = [clientAddress, clientCity].filter(Boolean).join(', ');
  if (fullAddress) {
    const addrLines = doc.splitTextToSize(`Address: ${fullAddress}`, 80);
    doc.text(addrLines.slice(0, 2), 18, leftY);
    leftY += Math.min(addrLines.length, 2) * 3.5;
  }

  if (clientPhone) {
    doc.text(`Phone: ${clientPhone}`, 18, leftY);
    leftY += 3.5;
  }
  if (clientEmail) {
    const emailLines = doc.splitTextToSize(`Email: ${clientEmail}`, 80);
    doc.text(emailLines[0], 18, leftY);
    leftY += 3.5;
  }
  if (job.call_given_by) {
    doc.text(`Caller: ${job.call_given_by}`, 18, leftY);
  }

  // Right Box (Service Call & Engineer Details)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(108, y, 88, boxHeight, 2, 2, 'FD');

  // Right Box Header Strip
  doc.setFillColor(241, 245, 249);
  doc.rect(108, y, 88, 7, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('SERVICE CALL & ENGINEER ASSIGNMENT', 112, y + 4.8);

  let rightY = y + 11.5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);

  doc.text('Call Slip No:', 112, rightY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`#${job.job_number || 'JOB-1001'}`, 146, rightY);
  rightY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Call Type:', 112, rightY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text(`${job.call_type || 'Per Call'}`, 146, rightY);
  rightY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Lead Engineer:', 112, rightY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const leadEngLine = doc.splitTextToSize(`${engineerName} ${engineerPhone ? `(${engineerPhone})` : ''}`, 48);
  doc.text(leadEngLine[0], 146, rightY);
  rightY += 4.5;

  if (assistEngineerName) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text('Assist Engineer:', 112, rightY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(79, 70, 229);
    const assistLine = doc.splitTextToSize(`${assistEngineerName} (Assist)`, 48);
    doc.text(assistLine[0], 146, rightY);
    rightY += 4.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Service Status:', 112, rightY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 163, 74);
  doc.text('Completed ✓', 146, rightY);
  rightY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Date & Time:', 112, rightY);
  doc.setTextColor(15, 23, 42);
  doc.text(`${job.scheduled_date || formattedDate} ${job.scheduled_time || ''}`, 146, rightY);

  y += boxHeight + 4; // y is now ~91mm

  // 3. Trip & Service Time Metrics Row (ONLY included when includeTravel is TRUE)
  if (includeTravel) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, y, 182, 16, 2, 2, 'FD');

    // Header label
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('TRAVEL TIME (ON CALL)', 44, y + 4.8, { align: 'center' });
    doc.text('TRAVEL DISTANCE (KM)', 105, y + 4.8, { align: 'center' });
    doc.text('IN-CLIENT SERVICE TIME', 166, y + 4.8, { align: 'center' });

    // Values
    doc.setFontSize(10.5);
    doc.setTextColor(37, 99, 235);
    doc.text(travelTime, 44, y + 12, { align: 'center' });

    doc.setTextColor(22, 163, 74);
    doc.text(totalKm, 105, y + 12, { align: 'center' });

    doc.setTextColor(217, 119, 6);
    doc.text(serviceTime, 166, y + 12, { align: 'center' });

    y += 20;
  }

  // 4. Equipment & Technical Parameters Bar (width = 182mm)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, 182, 14, 2, 2, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('PROBLEM DEVICE / SERIAL ID', 18, y + 4.5);
  doc.text('EARTH VOLTAGE CHECKING', 85, y + 4.5);
  doc.text('PHYSICAL CONDITION / DAMAGE', 145, y + 4.5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const devText = (job.device_id || '').trim() || 'Client System / Device';
  const devLines = doc.splitTextToSize(devText, 62);
  doc.text(devLines[0], 18, y + 10);

  const earthVal = job.earth_checking || 'Yes';
  doc.setTextColor(earthVal === 'Yes' ? 22 : 220, earthVal === 'Yes' ? 163 : 38, earthVal === 'Yes' ? 74 : 38);
  doc.text(earthVal === 'Yes' ? 'Passed (Normal Voltage)' : 'Failed / Caution', 85, y + 10);

  const dmgVal = job.physical_damage || 'No';
  doc.setTextColor(dmgVal === 'No' ? 22 : 220, dmgVal === 'No' ? 163 : 38, dmgVal === 'No' ? 74 : 38);
  doc.text(dmgVal === 'No' ? 'Clean (No Physical Damage)' : 'Damage / Scratch Noted', 145, y + 10);

  y += 18;

  // 5. Detailed Technical Service Scope & Work Done (width = 182mm)
  doc.setFontSize(8);
  const probLines = doc.splitTextToSize(job.issue_title + (job.issue_description ? ` — ${job.issue_description}` : ''), 136);
  const diagLines = doc.splitTextToSize(job.diagnosis || 'Hardware and software diagnostic inspection completed on-site.', 136);
  const workLines = doc.splitTextToSize(job.work_performed || 'Service completed, verified, and tested on-site.', 136);
  const partLines = job.parts_replaced ? doc.splitTextToSize(job.parts_replaced, 136) : [];
  const notesLines = job.engineer_notes ? doc.splitTextToSize(job.engineer_notes, 136) : [];

  let serviceDetailsHeight = 7 + (probLines.length * 3.8) + (diagLines.length * 3.8) + (workLines.length * 3.8) + 12;
  if (partLines.length > 0) serviceDetailsHeight += (partLines.length * 3.8) + 3;
  if (notesLines.length > 0) serviceDetailsHeight += (notesLines.length * 3.8) + 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, 182, serviceDetailsHeight, 2, 2, 'FD');

  // Header band
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 6.5, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('SERVICE DETAILS & TECHNICAL ACTIONS TAKEN', 18, y + 4.5);

  let curY = y + 11.5;

  // Problem Reported
  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Problem Reported:', 18, curY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(probLines, 55, curY);
  curY += probLines.length * 3.8 + 2.5;

  // Diagnosis
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Diagnosis / Root Cause:', 18, curY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(diagLines, 55, curY);
  curY += diagLines.length * 3.8 + 2.5;

  // Action Taken
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Action Taken / Work:', 18, curY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(workLines, 55, curY);
  curY += workLines.length * 3.8 + 2.5;

  if (partLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Parts / Materials:', 18, curY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(partLines, 55, curY);
    curY += partLines.length * 3.8 + 2.5;
  }

  if (notesLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(100, 116, 139);
    doc.text('Engineer Advice:', 18, curY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(notesLines, 55, curY);
    curY += notesLines.length * 3.8 + 2.5;
  }

  y += serviceDetailsHeight + 4;

  // 6. Commercials & Charges Breakdown Table (width = 182mm)
  const tableHeight = 36;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, y, 182, tableHeight, 2, 2, 'FD');

  // Table header
  doc.setFillColor(15, 23, 42);
  doc.rect(14, y, 182, 6.5, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('SERVICE CHARGE DESCRIPTION', 18, y + 4.5);
  doc.text('REMARKS / CONTRACT STATUS', 90, y + 4.5);
  doc.text('AMOUNT (INR)', 190, y + 4.5, { align: 'right' });

  const isCovered = job.call_type === 'Warranty' || job.call_type === 'ASC';
  const inspFee = isCovered ? 0 : (job.inspection_charge ?? 0);
  const partFee = (job.part_replaced_status === 'Yes' || (job.part_charge && job.part_charge > 0)) ? (job.part_charge ?? 0) : 0;
  const servFee = isCovered ? 0 : (job.service_charge ?? 0);
  const totalAmount = isCovered ? partFee : (inspFee + partFee + servFee);

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  // Row 1: Inspection
  doc.setFont('helvetica', 'normal');
  doc.text('1. Inspection & Diagnostic Fee', 18, y + 11.5);
  doc.text(isCovered ? 'Covered under Warranty / AMC' : 'Standard On-site Diagnostic', 90, y + 11.5);
  doc.text(`Rs. ${inspFee}`, 190, y + 11.5, { align: 'right' });

  // Row 2: Parts
  doc.text('2. Spare Parts & Replacement Materials', 18, y + 16.5);
  doc.text(partFee > 0 ? (job.parts_replaced || 'Replacement Hardware Part') : 'No Chargeable Parts', 90, y + 16.5);
  doc.text(`Rs. ${partFee}`, 190, y + 16.5, { align: 'right' });

  // Row 3: Service Labor
  doc.text('3. Service & Labor Charges', 18, y + 21.5);
  doc.text(isCovered ? 'Covered under Warranty / AMC' : 'Field Technical Labor Charge', 90, y + 21.5);
  doc.text(`Rs. ${servFee}`, 190, y + 21.5, { align: 'right' });

  // Total Row strip
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y + 26, 182, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(8.5);
  doc.text('TOTAL AMOUNT PAYABLE:', 18, y + 32.5);
  doc.setTextColor(22, 163, 74);
  doc.setFontSize(10.5);
  doc.text(`Rs. ${totalAmount}`, 70, y + 32.5);

  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text(`Payment Mode: ${job.payment_mode || 'Cash'}`, 115, y + 32.5);
  doc.text(`Received: ${job.amount_received || 'Yes'}`, 160, y + 32.5);

  y += tableHeight + 5;

  // 7. Customer Declaration & Signatures
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, 182, 28, 2, 2, 'D');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Customer Acknowledgement: I / We hereby acknowledge that the above service has been carried out to our complete satisfaction and the equipment has been verified, tested, and handed over in satisfactory working condition.',
    18,
    y + 5.5,
    { maxWidth: 174 }
  );

  // Signatures lines
  const sigY = y + 20;
  doc.setDrawColor(148, 163, 184);
  doc.line(25, sigY, 80, sigY);
  doc.line(130, sigY, 185, sigY);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('Customer Signature & Seal', 52.5, sigY + 4.5, { align: 'center' });
  doc.text('For Infant Computer Store (Engineer)', 157.5, sigY + 4.5, { align: 'center' });

  // 8. Footer Notice
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text('Infant Computer Store • 240/A2B, Sarada Mill Road, Near Koushikha Hospital, Podanur, Coimbatore - 641023', 105, 287, { align: 'center' });
  doc.text('Warranty Terms: 30 days service warranty on workmanship. Physical damage, burnt components, or electrical spikes are void of warranty.', 105, 291, { align: 'center' });

  return doc.output('blob');
}

/**
 * Downloads the PDF directly for the office / admin / user
 * Defaults to including Travel KM & Time
 */
export async function downloadCallReportPdf(job: ServiceJob, options: CallReportOptions = { includeTravelMetrics: true }): Promise<void> {
  const blob = await generateCallReportPdfBlob(job, options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ICS-Call-Report-${job.job_number || 'JOB'}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = (dataUrl.split(',')[1] || '').trim();
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

import { getSavedSmtpConfig } from './smtpSettings';

/**
 * ONLY sends to Customer email with PDF attached & downloads PDF copy
 * Travel metrics (Travel Time, KM, Service Time) are STRICTLY EXCLUDED from customer report
 * Sends directly from accounts@icsstore.in via Hostinger SMTP
 */
export async function sendCustomerCallReportPdf(
  job: ServiceJob
): Promise<{ success: boolean; message: string; requiresConfig?: boolean }> {
  const customerEmail = job.client?.email?.trim();
  const customerName = job.client?.client_name || 'Customer';
  const subject = `Infant Computer Store (ICS) - Service Call Report #${job.job_number || '1001'} (PDF Attached)`;

  console.log(`[Official ICS Mail] Dispatching call report PDF to customer: ${customerEmail} from accounts@icsstore.in`);

  if (!customerEmail) {
    // If no customer email provided in client record, auto download the customer copy (without travel metrics)
    await downloadCallReportPdf(job, { includeTravelMetrics: false });
    return {
      success: true,
      message: 'Customer email not configured in client details. Customer PDF Report downloaded.',
    };
  }

  const smtpConfig = getSavedSmtpConfig();

  try {
    // Generate PDF Blob WITHOUT travel metrics for customer copy
    const pdfBlob = await generateCallReportPdfBlob(job, { includeTravelMetrics: false });
    const pdfBase64 = await blobToBase64(pdfBlob);
    const fileName = `ICS-Call-Report-${job.job_number || 'JOB'}.pdf`;

    const isCovered = job.call_type === 'Warranty' || job.call_type === 'ASC';
    const inspFee = isCovered ? 0 : (job.inspection_charge ?? 0);
    const partFee = (job.part_replaced_status === 'Yes' || (job.part_charge && job.part_charge > 0)) ? (job.part_charge ?? 0) : 0;
    const servFee = isCovered ? 0 : (job.service_charge ?? 0);
    const totalAmount = isCovered ? partFee : (inspFee + partFee + servFee);

    // Rich HTML email body with ICS branding and PDF attachment notice
    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1.5px solid #0f172a; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #0f172a; color: #ffffff; padding: 22px 24px; border-bottom: 3px solid #2563eb;">
          <h1 style="margin: 0; font-size: 19px; font-weight: 800; letter-spacing: 0.5px;">INFANT COMPUTER STORE (ICS)</h1>
          <p style="margin: 3px 0 0; color: #94a3b8; font-size: 11.5px;">Total IT Hardware Solutions • Chip-Level Service • AMC Contracts</p>
          <p style="margin: 3px 0 0; color: #cbd5e1; font-size: 11px;">240/A2B, Sarada Mill Road, Near Koushikha Hospital, Podanur, Coimbatore - 641023</p>
        </div>
        
        <div style="padding: 22px 24px; color: #334155;">
          <div style="background-color: #eff6ff; border: 1.5px solid #93c5fd; border-radius: 8px; padding: 12px 16px; margin-bottom: 18px;">
            <p style="margin: 0; font-size: 13.5px; font-weight: 800; color: #1e40af;">📎 Official Call Report PDF Attached</p>
            <p style="margin: 3px 0 0; font-size: 12px; color: #1e3a8a;">
              Please find your official Service Call Report (<strong>${fileName}</strong>) attached to this email.
            </p>
          </div>

          <p style="font-size: 13.5px; margin: 0 0 12px;">Dear <strong>${customerName}</strong>,</p>
          <p style="font-size: 13px; line-height: 1.6; margin: 0 0 16px; color: #475569;">
            Thank you for choosing Infant Computer Store. Your service call has been completed. Below is the summary of work done:
          </p>

          <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 18px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; font-weight: 700; color: #64748b; width: 38%;">Call Slip No</td>
              <td style="padding: 9px 12px; font-weight: 800; color: #0f172a;">${job.job_number || 'JOB-1001'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">Call Category</td>
              <td style="padding: 9px 12px; font-weight: 600; color: #0f172a;">${job.call_type || 'Per Call'}</td>
            </tr>
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">Problem Reported</td>
              <td style="padding: 9px 12px; color: #0f172a;">${job.issue_title}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">Work Performed</td>
              <td style="padding: 9px 12px; color: #0f172a;">${job.work_performed || 'Service completed on-site'}</td>
            </tr>
            <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">Service Engineer</td>
              <td style="padding: 9px 12px; font-weight: 700; color: #0f172a;">${job.engineer?.full_name || 'Service Engineer'}</td>
            </tr>
            ${
              job.is_assist_call && job.assist_engineer?.full_name
                ? `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; font-weight: 700; color: #64748b;">Assist Engineer</td>
              <td style="padding: 9px 12px; color: #0f172a;">${job.assist_engineer.full_name}</td>
            </tr>`
                : ''
            }
            <tr style="background-color: #f1f5f9;">
              <td style="padding: 10px 12px; font-weight: 800; color: #0f172a;">Total Payable</td>
              <td style="padding: 10px 12px; font-weight: 800; color: #16a34a; font-size: 13.5px;">Rs. ${totalAmount} (${job.payment_mode || 'Cash'})</td>
            </tr>
          </table>

          <p style="font-size: 11.5px; color: #64748b; line-height: 1.5; margin: 14px 0 0;">
            For warranty terms or technical support, please contact us at +91 96266 44496 / 96266 44490 or email accounts@icsstore.in.
          </p>
        </div>

        <div style="background-color: #f8fafc; padding: 14px 20px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
          Infant Computer Store • 240/A2B, Sarada Mill Road, Podanur, Coimbatore • accounts@icsstore.in
        </div>
      </div>
    `;

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: customerEmail,
        subject: subject,
        html: emailHtml,
        text: `Infant Computer Store (ICS)\n\nService Call Report #${job.job_number || 'JOB-1001'} is attached to this email.\n\nCustomer: ${customerName}\nTotal: Rs. ${totalAmount}\n\nInfant Computer Store, Podanur, Coimbatore - accounts@icsstore.in`,
        pdfBase64: pdfBase64,
        fileName: fileName,
        smtpConfig: smtpConfig,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success) {
      const errText = result.error || 'Failed to dispatch email via SMTP server';
      const isAuthError =
        errText.toLowerCase().includes('password') ||
        errText.toLowerCase().includes('auth') ||
        errText.toLowerCase().includes('credentials') ||
        errText.toLowerCase().includes('login');
      return {
        success: false,
        message: errText,
        requiresConfig: isAuthError,
      };
    }

    // Audit log
    const emailHistory = JSON.parse(localStorage.getItem('sent_call_reports') || '[]');
    emailHistory.unshift({
      id: crypto.randomUUID(),
      jobNumber: job.job_number || 'JOB-1001',
      clientName: customerName,
      customerEmail: customerEmail,
      senderEmail: smtpConfig.user || 'accounts@icsstore.in',
      sentAt: new Date().toISOString(),
      subject: subject,
      pdfGenerated: true,
    });
    localStorage.setItem('sent_call_reports', JSON.stringify(emailHistory.slice(0, 50)));

    return {
      success: true,
      message: `Official Call Report PDF sent from accounts@icsstore.in to ${customerEmail}!`,
    };
  } catch (err) {
    console.error('Customer email PDF error:', err);
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Customer email dispatch failed',
    };
  }
}
