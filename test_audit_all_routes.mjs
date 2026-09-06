import { chromium } from 'playwright';

async function auditAllRoutes() {
  console.log('====================================================');
  console.log('🚀 FULL SYSTEM ROUTE & UI LOGICAL AUDIT');
  console.log('Target: http://localhost:5174');
  console.log('====================================================\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const auditLog = [];
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('WebSocket') && !txt.includes('favicon') && !txt.includes('React DevTools')) {
        errors.push(`[Console Error on ${page.url()}]: ${txt}`);
      }
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`[Page Crash on ${page.url()}]: ${err.message}`);
  });

  async function visit(url, name, checkSelector) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(800);
      let foundCheck = true;
      if (checkSelector) {
        foundCheck = await page.locator(checkSelector).first().isVisible();
      }
      auditLog.push({ url, name, status: 'OK', selectorChecked: checkSelector, visible: foundCheck });
      console.log(`✅ [${name}] visited successfully (${url})`);
      return true;
    } catch (e) {
      auditLog.push({ url, name, status: 'FAILED', error: e.message });
      console.error(`❌ [${name}] failed: ${e.message}`);
      return false;
    }
  }

  // 1. ADMIN AUDIT
  console.log('\n--- 1. AUDITING ADMIN PORTAL ---');
  await page.goto('http://localhost:5174/login');
  await page.waitForTimeout(600);
  await page.fill('#login-username', 'admin1');
  await page.fill('#login-password', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  const adminRoutes = [
    { url: 'http://localhost:5174/admin/dashboard', name: 'Admin Dashboard', selector: 'h1' },
    { url: 'http://localhost:5174/admin/requests', name: 'Admin Call Requests', selector: 'h1' },
    { url: 'http://localhost:5174/admin/jobs', name: 'Admin Jobs List', selector: 'button:has-text("Create Job"), button:has-text("New Job")' },
    { url: 'http://localhost:5174/admin/engineers', name: 'Admin Engineers', selector: 'h1' },
    { url: 'http://localhost:5174/admin/attendance', name: 'Admin Attendance Hub', selector: 'h1' },
    { url: 'http://localhost:5174/admin/clients', name: 'Admin Clients Directory', selector: 'h1' },
    { url: 'http://localhost:5174/admin/vendors', name: 'Admin Vendors & Handover', selector: 'h1' },
    { url: 'http://localhost:5174/admin/tracking', name: 'Admin Live Tracking', selector: 'h1' },
    { url: 'http://localhost:5174/admin/reports', name: 'Admin Service & KM Reports', selector: 'h1' },
    { url: 'http://localhost:5174/admin/leads', name: 'Admin Leads Pipeline', selector: 'h1' },
    { url: 'http://localhost:5174/admin/leads-dashboard', name: 'Admin Leads Analytics', selector: 'h1' },
    { url: 'http://localhost:5174/admin/lead-reports', name: 'Admin Lead Reports', selector: 'h1' },
  ];

  for (const r of adminRoutes) {
    await visit(r.url, r.name, r.selector);
  }

  // Test Clients Service History Month Filter Modal
  console.log('\nTesting Client Service History Month Filter...');
  await page.goto('http://localhost:5174/admin/clients');
  await page.waitForTimeout(1000);
  const viewHistoryBtn = page.locator('button:has-text("History"), button:has-text("Service History")').first();
  if (await viewHistoryBtn.isVisible()) {
    await viewHistoryBtn.click();
    await page.waitForTimeout(1000);
    const monthDropdown = page.locator('select').first();
    const isMonthVisible = await monthDropdown.isVisible();
    console.log(`  🔍 Client Service History Month Dropdown visible: ${isMonthVisible}`);
    // Close modal
    const closeBtn = page.locator('button:has-text("Close"), button:has-text("✕")').first();
    if (await closeBtn.isVisible()) await closeBtn.click();
  }

  // Test Live Tracking Absent & Leave Badges
  console.log('\nTesting Live Tracking Absent & Leave Badges...');
  await page.goto('http://localhost:5174/admin/tracking');
  await page.waitForTimeout(1500);
  const absentText = await page.locator('text=Absent').first().isVisible();
  const absentCards = await page.locator('text=Absent').count();
  console.log(`  🔍 Live Tracking Absent status rendered: ${absentText} (count: ${absentCards})`);

  // Sign out
  await page.evaluate(() => {
    localStorage.removeItem('local_mock_auth_user');
  });

  // 2. ENGINEER AUDIT
  console.log('\n--- 2. AUDITING ENGINEER PORTAL ---');
  await page.goto('http://localhost:5174/login');
  await page.waitForTimeout(600);
  await page.fill('#login-username', 'engineer1');
  await page.fill('#login-password', '');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  const engineerRoutes = [
    { url: 'http://localhost:5174/engineer/home', name: 'Engineer Home / Punch In', selector: 'h1, h2' },
    { url: 'http://localhost:5174/engineer/jobs', name: 'Engineer Jobs Queue', selector: 'h1, h2' },
    { url: 'http://localhost:5174/engineer/attendance', name: 'Engineer Duty Attendance & Leaves', selector: 'h1, h2' },
    { url: 'http://localhost:5174/engineer/history', name: 'Engineer Service History', selector: 'h1, h2' },
    { url: 'http://localhost:5174/engineer/leads', name: 'Engineer Spot Leads', selector: 'h1, h2' },
    { url: 'http://localhost:5174/engineer/profile', name: 'Engineer Profile Settings', selector: 'h1, h2' },
  ];

  for (const r of engineerRoutes) {
    await visit(r.url, r.name, r.selector);
  }

  // Sign out
  await page.evaluate(() => {
    localStorage.removeItem('local_mock_auth_user');
  });

  // 3. SALES AUDIT
  console.log('\n--- 3. AUDITING SALES PORTAL ---');
  await page.goto('http://localhost:5174/login');
  await page.waitForTimeout(600);
  await page.fill('#login-username', 'sales1');
  await page.fill('#login-password', 'sales123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  const salesRoutes = [
    { url: 'http://localhost:5174/sales/dashboard', name: 'Sales Dashboard', selector: 'h1' },
    { url: 'http://localhost:5174/sales/leads', name: 'Sales Leads Pipeline', selector: 'h1' },
    { url: 'http://localhost:5174/sales/followups', name: 'Sales Followups Calendar', selector: 'h1' },
    { url: 'http://localhost:5174/sales/quotations', name: 'Sales Quotation Builder', selector: 'h1' },
    { url: 'http://localhost:5174/sales/reports', name: 'Sales Lead Reports', selector: 'h1' },
    { url: 'http://localhost:5174/sales/profile', name: 'Sales Profile', selector: 'h1, h2' },
  ];

  for (const r of salesRoutes) {
    await visit(r.url, r.name, r.selector);
  }

  // Sign out
  await page.evaluate(() => {
    localStorage.removeItem('local_mock_auth_user');
  });

  // 4. CLIENT AUDIT
  console.log('\n--- 4. AUDITING CLIENT PORTAL ---');
  await page.goto('http://localhost:5174/login');
  await page.waitForTimeout(600);
  await page.fill('#login-username', 'client1');
  await page.fill('#login-password', 'client123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  const clientRoutes = [
    { url: 'http://localhost:5174/client/book', name: 'Client Book Service Call', selector: 'h1, h2' },
    { url: 'http://localhost:5174/client/calls', name: 'Client Service Calls & Tracking', selector: 'h1, h2' },
    { url: 'http://localhost:5174/client/profile', name: 'Client Organization Profile', selector: 'h1, h2' },
  ];

  for (const r of clientRoutes) {
    await visit(r.url, r.name, r.selector);
  }

  console.log('\n====================================================');
  console.log('📊 AUDIT SUMMARY:');
  console.log(`Total Routes Visited: ${auditLog.length}`);
  console.log(`Successful: ${auditLog.filter(x => x.status === 'OK').length}`);
  console.log(`Failed: ${auditLog.filter(x => x.status === 'FAILED').length}`);
  console.log(`Runtime / Console Errors detected: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:', errors);
  }
  console.log('====================================================\n');

  await browser.close();
}

auditAllRoutes().catch((e) => {
  console.error('Audit Script Error:', e);
  process.exit(1);
});
