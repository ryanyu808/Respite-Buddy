import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('offline sample schedule opens exact saved engine recommendations and both walking legs', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByRole('button', { name: 'Import sample schedule', exact: true }).click()
  await expect(
    page.getByText('DEMO ONLY — sample schedule; your actual records are untouched.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Find reset opportunities', exact: true }).click()
  await expect(page.getByRole('heading', { name: /13:00–13:15/ })).toBeVisible()
  await expect(page.locator('.calendar-gap')).toContainText('2 backup options')
  await page.getByRole('button', { name: 'Open this break & walking directions' }).click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(3)
  await expect(page.getByText('Saved demonstration (works offline)')).toBeVisible()
  await expect(page.locator('.reset-route .walking-route-line').first()).toBeVisible()
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await expect(
    page.getByText('DEMO ONLY — sample schedule; your actual records are untouched.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Edit Sample workshop', exact: true }).click()
  await expect(page.getByLabel('Course or event name', { exact: true })).toHaveValue(
    'Sample workshop',
  )
  await page.screenshot({ path: '../tmp/calendar-demo-routes.png', fullPage: true })
})

test('manual recurring classes persist, edit, detect duplicates and clear explicitly', async ({
  page,
}) => {
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByLabel('Course or event name', { exact: true }).fill('CSCI local test')
  await page.getByLabel('First date', { exact: true }).fill('2026-10-19')
  await page.getByLabel('Last recurring date (optional)', { exact: true }).fill('2026-11-16')
  await page.getByLabel('Building', { exact: true }).fill('Leavey Library')
  await page
    .getByRole('group', { name: 'Repeat weekly (leave unchecked for a single date)' })
    .getByLabel('Mon', { exact: true })
    .check()
  await page.getByRole('button', { name: 'Add event', exact: true }).click()
  await expect(
    page.getByText('Saved locally. Review overlap warnings before planning gaps.'),
  ).toBeVisible()
  await page.getByLabel('Selected date', { exact: true }).fill('2026-11-02')
  await expect(
    page.getByRole('button', { name: 'Edit CSCI local test', exact: true }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByLabel('Selected date', { exact: true }).fill('2026-11-02')
  await page.getByRole('button', { name: 'Edit CSCI local test', exact: true }).click()
  await page.getByLabel('Course or event name', { exact: true }).fill('CSCI corrected')
  await page.getByRole('button', { name: 'Save event changes', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit CSCI corrected', exact: true })).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Clear all local schedule', exact: true }).click()
  await expect(
    page.getByText('No events on this day. Add a class below or import a calendar.'),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await expect(page.locator('.day-agenda li')).toHaveCount(0)
})

test('ICS import is reviewed, not silently classified, and duplicate imports are skipped', async ({
  page,
}) => {
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByLabel('Import range starts', { exact: true }).fill('2026-10-19')
  await page.getByLabel('Import range ends (maximum 120 days)', { exact: true }).fill('2026-11-03')
  const file = {
    name: 'class.ics',
    mimeType: 'text/calendar',
    buffer: Buffer.from(
      'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:private-class\r\nSUMMARY:Private class title\r\nLOCATION:Leavey Library\r\nDTSTART;TZID=America/Los_Angeles:20261019T090000\r\nDTEND;TZID=America/Los_Angeles:20261019T100000\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR',
    ),
  }
  await page.getByLabel('ICS calendar file', { exact: true }).setInputFiles(file)
  await expect(
    page.getByRole('heading', { name: 'Review import · nothing saved yet' }),
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Imported category', exact: true }).first(),
  ).toHaveValue('unclassified')
  await page
    .getByRole('combobox', { name: 'Imported category', exact: true })
    .first()
    .selectOption('class')
  await page.getByRole('button', { name: 'Save reviewed import', exact: true }).click()
  await expect(page.getByText('3 reviewed events saved; duplicates skipped.')).toBeVisible()
  await page.getByLabel('ICS calendar file', { exact: true }).setInputFiles(file)
  await page.getByRole('button', { name: 'Save reviewed import', exact: true }).click()
  await expect(page.getByText('0 reviewed events saved; duplicates skipped.')).toBeVisible()
  expect(page.url()).not.toContain('Private')
  await page.getByLabel('Selected date', { exact: true }).fill('2026-10-19')
  await expect(
    page.getByRole('button', { name: 'Edit Private class title', exact: true }),
  ).toBeVisible()
})

test('candidate directory and mobile schedule are accessible, honest, and do not overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Campus spaces', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(36)
  await page.getByLabel('Search campus spaces', { exact: true }).fill('210A')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).toContainText('Reservation required')
  await expect(page.getByRole('article')).toContainText('USC documented — conditions unconfirmed')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByRole('button', { name: 'Import sample schedule', exact: true }).click()
  await page.getByText('Connect a read-only calendar (optional)', { exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Connect Microsoft Outlook', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Connect Google Calendar', exact: true }),
  ).toBeDisabled()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.wheel(0, 500)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '../tmp/calendar-mobile.png', fullPage: true })
})

test('live gap planning transmits only class locations and times and stays honest about empty scout data', async ({
  page,
}) => {
  let sent: unknown
  page.on('request', (request) => {
    if (request.url().endsWith('/api/plan-day')) sent = request.postDataJSON()
  })
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  for (const [title, building, start, end] of [
    ['Private lecture', 'Leavey Library', '12:00', '13:00'],
    ['Private seminar', 'Tutor Campus Center', '13:15', '14:15'],
  ]) {
    await page.getByLabel('Course or event name', { exact: true }).fill(title)
    await page.getByLabel('First date', { exact: true }).fill('2026-10-19')
    await page.getByLabel('Building', { exact: true }).fill(building)
    await page.getByLabel('Starts', { exact: true }).fill(start)
    await page.getByLabel('Ends', { exact: true }).fill(end)
    await page.getByRole('button', { name: 'Add event', exact: true }).click()
    await expect(
      page.getByText('Saved locally. Review overlap warnings before planning gaps.'),
    ).toBeVisible()
  }
  await page.getByLabel('Selected date', { exact: true }).fill('2026-10-19')
  await page.getByRole('button', { name: 'Find reset opportunities', exact: true }).click()
  await expect(page.locator('.calendar-gap')).toContainText("We're still confirming campus spaces.")
  expect(JSON.stringify(sent)).not.toContain('Private')
  expect(sent).toMatchObject({
    demo: false,
    classes: [{ location: 'Leavey Library' }, { location: 'Tutor Campus Center' }],
  })
  await page.getByRole('button', { name: 'Explore documented locations', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(36)
})
