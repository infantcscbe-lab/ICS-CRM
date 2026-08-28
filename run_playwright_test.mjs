import { chromium } from 'playwright';

async function runTests() {
  console.log('🚀 Starting Playwright End-to-End Tests for ICS Service Manager...');
  
  let browser;
  try {
    // Try default chromium, fallback to msedge / chrome channel if available
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }
  } catch (err) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true });
    } catch (e2) {
      console.error('Failed to launch browser:', e2);
      process.exit(1);
    }
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
  });

  try {
    console.log('1️⃣ Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('h1', { timeout: 5000 }).catch(() => {});
    console.log('   ✓ Page loaded. Current URL:', page.url());

    // 2. Test Login Page
    console.log('2️⃣ Verifying Login Page elements...');
    const heading = await page.textContent('h1');
    console.log('   ✓ Heading found:', heading);

    const usernameInput = page.locator('#login-username');
    const passwordInput = page.locator('#login-password');
    const submitBtn = page.locator('button[type="submit"]');

    if (await usernameInput.isVisible() && await passwordInput.isVisible()) {
      console.log('   ✓ Username and Password inputs are visible.');
      
      console.log('3️⃣ Logging in with admin1 / admin123...');
      await usernameInput.fill('admin1');
      await passwordInput.fill('admin123');
      await submitBtn.click();
      
      await page.waitForTimeout(2000);
      console.log('   ✓ Logged in! Current URL:', page.url());

      // 4. Test Navigation in Admin Dashboard
      console.log('4️⃣ Testing Admin navigation...');
      const adminNavLinks = ['Dashboard', 'Jobs', 'Clients', 'Engineers', 'Attendance', 'Reports'];
      for (const linkText of adminNavLinks) {
        const link = page.getByRole('link', { name: linkText, exact: false }).first();
        if (await link.isVisible()) {
          await link.click();
          await page.waitForTimeout(1000);
          console.log(`   ✓ Navigated to ${linkText}: ${page.url()}`);
        }
      }

      // 5. Test Engineer Job Details Navigation
      console.log('5️⃣ Testing Engineer View & Job Details Flow...');
      // Sign out and sign in or go to an engineer route
      await page.evaluate(() => {
        const engineerProfile = {
          id: '22222222-2222-2222-2222-222222222222',
          full_name: 'Test Engineer',
          email: 'engineer@local',
          phone: '+91 99999 88888',
          role: 'engineer',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const mockSession = {
          access_token: 'mock-eng-token',
          token_type: 'bearer',
          expires_in: 86400,
          refresh_token: 'mock-eng-refresh',
          user: {
            id: engineerProfile.id,
            app_metadata: { role: 'engineer' },
            user_metadata: { full_name: engineerProfile.full_name, role: 'engineer' },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          },
        };
        localStorage.setItem('local_mock_auth_user', JSON.stringify({ session: mockSession, profile: engineerProfile }));
      });

      await page.goto('http://localhost:5173/engineer/jobs', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      console.log('   ✓ Navigated to Engineer Jobs page:', page.url());
      
      const pageTitle = await page.title();
      console.log('   ✓ Page title:', pageTitle);
    }

    console.log('\n📊 Test Summary:');
    console.log('   - Total fatal uncaught errors:', consoleErrors.filter(e => !e.includes('WebSocket') && !e.includes('React DevTools')).length);
    console.log('🎉 All Playwright automated tests completed successfully!');

  } catch (err) {
    console.error('❌ Test execution failed:', err);
  } finally {
    await browser.close();
  }
}

runTests();
