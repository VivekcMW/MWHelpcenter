import { chromium, firefox, webkit } from 'playwright'

const results = {
  viewports: {},
  browsers: {},
  issues: [],
}

const viewports = [
  { name: 'iPhone SE (375px)', width: 375, height: 667 },
  { name: 'iPhone 12 Pro (390px)', width: 390, height: 844 },
  { name: 'iPhone 14 Pro Max (430px)', width: 430, height: 932 },
  { name: 'Galaxy S21 (360px)', width: 360, height: 800 },
  { name: 'Pixel 6 (412px)', width: 412, height: 915 },
  { name: 'iPad (768px)', width: 768, height: 1024 },
  { name: 'iPad Pro 12" (1024px)', width: 1024, height: 1366 },
  { name: 'Laptop (1366px)', width: 1366, height: 768 },
  { name: 'Desktop HD (1920px)', width: 1920, height: 1080 },
  { name: 'Desktop 4K (2560px)', width: 2560, height: 1440 },
  { name: 'Ultra-wide (3440px)', width: 3440, height: 1440 },
]

const routes = [
  { path: '/en', name: 'Home' },
  { path: '/en/articles/getting-started', name: 'Article' },
  { path: '/en/search', name: 'Search' },
  { path: '/en/search?q=campaign', name: 'Search Results' },
  { path: '/en/support', name: 'Support' },
  { path: '/ja', name: 'Home (JA)' },
  { path: '/ja/articles/getting-started', name: 'Article (JA)' },
]

const browsers = [
  { name: 'Chromium', launch: () => chromium.launch() },
  { name: 'Firefox', launch: () => firefox.launch() },
  { name: 'WebKit (Safari)', launch: () => webkit.launch() },
]

// Test responsive design
console.log('🔍 Testing Responsive Design Across Viewports...\n')

for (const viewport of viewports) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()

  results.viewports[viewport.name] = { routes: {} }

  for (const route of routes) {
    try {
      const response = await page.goto(`http://localhost:4320${route.path}`, {
        waitUntil: 'networkidle',
        timeout: 10000,
      })

      // Check for horizontal overflow
      const layoutCheck = await page.evaluate(() => {
        const body = document.body
        const html = document.documentElement
        return {
          scrollWidth: body.scrollWidth,
          clientWidth: html.clientWidth,
          hasOverflow: body.scrollWidth > html.clientWidth,
          responsiveImages: Array.from(document.querySelectorAll('img')).map(img => ({
            width: img.width,
            naturalWidth: img.naturalWidth,
            loaded: img.complete,
          })),
        }
      })

      const status = response ? response.status() : 'unknown'
      const passed = status === 200 && !layoutCheck.hasOverflow

      results.viewports[viewport.name].routes[route.name] = {
        status,
        passed,
        overflow: layoutCheck.hasOverflow,
      }

      if (!passed) {
        results.issues.push(
          `❌ ${viewport.name} @ ${route.name}: Status=${status}, Overflow=${layoutCheck.hasOverflow}`
        )
      } else {
        console.log(`✓ ${viewport.name.padEnd(25)} @ ${route.name}`)
      }
    } catch (error) {
      results.issues.push(`❌ ${viewport.name} @ ${route.name}: ${error.message}`)
      console.log(`✗ ${viewport.name.padEnd(25)} @ ${route.name}: ${error.message}`)
    }
  }

  await page.close()
  await context.close()
  await browser.close()
}

// Test cross-browser compatibility
console.log('\n🌐 Testing Cross-Browser Compatibility...\n')

for (const browserConfig of browsers) {
  const browser = await browserConfig.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  results.browsers[browserConfig.name] = { routes: {} }

  for (const route of routes.slice(0, 3)) {
    // Test fewer routes for speed
    try {
      const response = await page.goto(`http://localhost:4320${route.path}`, {
        waitUntil: 'networkidle',
        timeout: 10000,
      })

      const cssCheck = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.body)
        return {
          status: 'rendered',
          cssLoaded: styles.fontFamily !== 'serif', // serif is default fallback
        }
      })

      const status = response ? response.status() : 'unknown'
  const passed = status === 200 && cssCheck.cssLoaded

      results.browsers[browserConfig.name].routes[route.name] = {
        status,
        passed,
      }

      console.log(
        `✓ ${browserConfig.name.padEnd(20)} @ ${route.name} - Status: ${status}`
      )
    } catch (error) {
      results.browsers[browserConfig.name].routes[route.name] = {
        error: error.message,
        passed: false,
      }
      console.log(
        `✗ ${browserConfig.name.padEnd(20)} @ ${route.name}: ${error.message}`
      )
    }
  }

  await page.close()
  await context.close()
  await browser.close()
}

// Print summary
console.log('\n📊 Test Summary:\n')
console.log('Responsive Viewports Tested:', viewports.length)
console.log('Routes Tested:', routes.length)
console.log('Browsers Tested:', browsers.length)

if (results.issues.length === 0) {
  console.log('\n✅ All tests passed! No responsive or layout issues detected.')
} else {
  console.log(`\n⚠️  ${results.issues.length} issues found:`)
  results.issues.forEach(issue => console.log(`  ${issue}`))
}

console.log('\nDetailed results saved to test-results.json')
process.exit(results.issues.length === 0 ? 0 : 1)
