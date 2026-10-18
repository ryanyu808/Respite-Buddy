import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('instant default demo works with an unavailable backend and map tiles', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/api/**', (route) => route.abort())
  await page.route('**/tile.openstreetmap.org/**', (route) => route.abort())
  await page.goto('/')
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByText('Presentation demo · sample conditions')).toHaveCount(0)
  await expect(page.getByText(/A few minutes to yourself/)).toHaveCount(0)
  await expect(page.getByLabel('Start time', { exact: true })).toBeVisible()
  await expect(page.getByLabel('End time', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Find me a spot' }).click()
  await expect(page.getByRole('region', { name: 'Somewhere to reset.' })).toBeFocused()
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
  await page.getByRole('button', { name: 'Then to class' }).click()
  await expect(page.getByRole('heading', { name: 'On to Tutor Campus Center.' })).toBeVisible()
  await expect(page.locator('.demo-directions').getByText(/Leave by 1:12 PM/)).toBeVisible()
  await page.getByRole('button', { name: 'Back to spots' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  expect(errors).toEqual([])
})

test('full skips retain the class time and restart is a single action', async ({ page }) => {
  await page.goto('/')
  const backupLeave = await page.getByRole('article').nth(1).locator('.demo-leave').innerText()
  await page.getByRole('button', { name: 'It’s full', exact: true }).first().click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('article').first().locator('.demo-leave')).toHaveText(backupLeave)
  await expect(page.getByRole('status').first()).toContainText('Your class time stays the same')
  await page.getByRole('button', { name: 'It’s full', exact: true }).first().click()
  await page.getByRole('button', { name: 'It’s full', exact: true }).first().click()
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('button', { name: 'Restart demo' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
})

test('optional tools are reachable without crowding the demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Plan a walk', exact: true })).toBeHidden()
  await page.getByText('More tools', { exact: true }).click()
  await page.getByRole('button', { name: 'Plan a walk', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Find My Route' })).toBeVisible()
  await page.getByRole('button', { name: 'Find a spot', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  await page.getByRole('button', { name: 'My Schedule' }).click()
  await expect(page.getByRole('heading', { name: 'My Schedule' })).toBeVisible()
})

test('mobile demo is keyboard accessible, unclipped and has no axe violations', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Find me a spot' })).toBeVisible()
  await expect(page.getByLabel('Start time', { exact: true })).toBeInViewport()
  await expect(page.getByLabel('End time', { exact: true })).toBeInViewport()
  for (const name of [
    'Outdoors',
    'Indoors',
    'Quiet',
    'Place to sit',
    'Lower light',
    'Fewer people',
  ]) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
  }
  await page.screenshot({ path: '../tmp/demo-home-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Find me a spot' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Somewhere to reset.' })).toBeFocused()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
