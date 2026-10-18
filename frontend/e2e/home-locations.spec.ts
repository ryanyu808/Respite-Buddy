import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('changing both locations recomputes both walking legs without Render', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByLabel('Starting from', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Next class / destination', { exact: true })).toHaveValue('')
  await page.getByLabel('Starting from', { exact: true }).fill('USC Village')
  await page.getByLabel('Next class / destination', { exact: true }).fill('DML')
  await page.getByLabel('End time', { exact: true }).fill('14:00')
  await page.getByRole('button', { name: 'Find me a spot', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.locator('.demo-applied-journey')).toHaveText(
    'USC Village → Doheny Memorial Library',
  )
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.locator('.demo-directions')).toContainText('Start at USC Village.')
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
  await page.getByRole('button', { name: 'Then to class', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'On to Doheny Memorial Library.' })).toBeVisible()
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
})

test('destination is optional on narrow mobile and zero-distance does not invent a map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByLabel('Starting from', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Next class / destination', { exact: true })).toBeVisible()
  await page.getByLabel('Next class / destination', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Find me a spot', exact: true }).click()
  await page.getByRole('button', { name: 'Indoors', exact: true }).click()
  await expect(page.locator('.demo-applied-journey')).toContainText(
    'Onward walking time is not included',
  )
  await expect(page.getByRole('article').first()).toContainText('provisional')
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'No outdoor walk needed.' })).toBeVisible()
  await expect(page.locator('.demo-directions')).toBeFocused()
  await expect(page.locator('.demo-map')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Then to class', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('saved local schedule fills the next destination and exact class time, not the current location', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-19T13:00:30-07:00'))
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByLabel('Course or event name', { exact: true }).fill('Private destination class')
  await page.getByLabel('First date', { exact: true }).fill('2026-10-19')
  await page.getByLabel('Starts', { exact: true }).fill('13:45')
  await page.getByLabel('Ends', { exact: true }).fill('14:45')
  await page.getByLabel('Building', { exact: true }).fill('Doheny Memorial Library')
  await page.getByRole('button', { name: 'Add event', exact: true }).click()
  await expect(
    page.getByText('Saved locally. Review overlap warnings before planning gaps.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Find a spot', exact: true }).click()
  await expect(page.getByLabel('Starting from', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Next class / destination', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: /Use saved next class/ }).click()
  await expect(page.getByLabel('Starting from', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Next class / destination', { exact: true })).toHaveValue(
    'Doheny Memorial Library',
  )
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('13:45')
  await expect(page.getByText(/Next destination from your saved schedule/)).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByText('Private destination class')).toHaveCount(0)
})

test('unknown locations stay explicit while JKP gets its actual selected route', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await page.getByLabel('Starting from', { exact: true }).fill('Imaginary Hall')
  await page.getByRole('button', { name: 'Find me a spot', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Choose a listed campus location')
  await expect(page.locator('.demo-applied-journey')).toContainText('No next destination')
  await page.getByLabel('Starting from', { exact: true }).fill('JKP')
  await page.getByRole('button', { name: 'Find me a spot', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.demo-applied-journey')).toContainText('Popovich Hall (JKP)')
  await expect(page.locator('.demo-applied-journey')).toContainText('No next destination')
})
