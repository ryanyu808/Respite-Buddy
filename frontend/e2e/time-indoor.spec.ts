import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('demo supports only four presets and immediately recalculates indoor choices offline', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await page.getByText('Change preferences · time & indoor options', { exact: true }).click()
  const intervals = page.getByRole('group', { name: 'Available time', exact: true })
  await expect(intervals.getByRole('button')).toHaveCount(4)
  for (const name of ['15 min', '30 min', '45 min', '1 hour']) {
    await intervals.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(3)
    await expect(intervals.getByRole('button', { name, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
  await page.getByRole('button', { name: 'Indoors', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByRole('article').first()).toContainText('Leavey Library')
  await expect(page.getByText('60 minutes, just for you.', { exact: true })).toBeVisible()
  await expect(page.getByRole('article').first()).toContainText('53 min to reset')
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.getByText(/You’re already at the approximate building/)).toBeVisible()
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
})

test('current time and class time calculate a custom break without restarting it on full', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await page.getByText('Change preferences · time & indoor options', { exact: true }).click()
  await page.getByText('Or use current time & class start', { exact: true }).click()
  await page.getByLabel('Break date', { exact: true }).fill('2026-10-19')
  await page.getByLabel('Current time', { exact: true }).fill('14:10')
  await page.getByLabel('Class starts', { exact: true }).fill('14:47')
  await page.getByRole('button', { name: 'Calculate my break', exact: true }).click()
  await expect(page.getByText('37 minutes, just for you.', { exact: true })).toBeVisible()
  await expect(page.getByText(/Next stop: Tutor Campus Center at 2:47 PM/)).toBeVisible()
  const leave = await page.getByRole('article').nth(1).locator('.demo-leave').innerText()
  await page.getByRole('button', { name: 'It’s full', exact: true }).first().click()
  await expect(page.getByRole('article').first().locator('.demo-leave')).toHaveText(leave)
  await page.getByLabel('Class starts', { exact: true }).fill('14:00')
  await page.getByRole('button', { name: 'Calculate my break', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Class must start after')
  await expect(page.getByRole('article')).toHaveCount(2)
})

test('sample schedule with indoor selected opens usable saved indoor routes', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByRole('button', { name: 'Import sample schedule', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Indoor', exact: true }).check()
  await page.getByRole('button', { name: 'Find reset opportunities', exact: true }).click()
  await expect(page.locator('.calendar-gap')).toContainText('Leavey Library')
  await page
    .getByRole('button', { name: 'Open this break & walking directions', exact: true })
    .click()
  await expect(page.locator('.reset-spot-card').first()).toContainText('Illustrative demo')
  await expect(page.locator('.reset-route .walking-route-line').first()).toBeVisible()
  await page.getByText('Change preferences', { exact: false }).first().click()
  await expect(
    page.getByRole('group', { name: 'Available time', exact: true }).getByRole('button'),
  ).toHaveCount(4)
})

test('real entered schedule shows documented indoor alternatives, not fabricated scout results', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-19T13:00:00-07:00'))
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  for (const [title, building, start, end] of [
    ['Private class', 'Leavey Library', '12:00', '13:00'],
    ['Next private class', 'Tutor Campus Center', '13:45', '14:30'],
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
  await page.getByRole('checkbox', { name: 'Indoor', exact: true }).check()
  await page.getByRole('button', { name: 'Find reset opportunities', exact: true }).click()
  await expect(page.locator('.calendar-gap')).toContainText('Documented indoor options')
  await page
    .getByRole('button', { name: 'Open this break & walking directions', exact: true })
    .click()
  await expect(page.getByText('Indoor options. Check entry; times are provisional.')).toBeVisible()
  await expect(page.locator('.reset-spot-card').first()).toContainText('Leavey Library')
  await expect(page.locator('.reset-spot-card').first()).toContainText('provisional')
  await expect(page.getByText('Verified by scouts', { exact: true })).toHaveCount(0)
})

test('new submitted places are searchable without duplicate or fabricated routing claims', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Campus spaces', exact: true }).click()
  await page.getByLabel('Search campus spaces', { exact: true }).fill('Hoose')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).toContainText('Team-submitted research · not verified')
  await expect(page.getByRole('button', { name: 'Walk me there', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByLabel('Search campus spaces', { exact: true }).fill('Hall of Honor')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Walk me there', exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})
