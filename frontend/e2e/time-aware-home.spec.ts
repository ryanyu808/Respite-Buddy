import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('empty location fields open all choices on click and filter names and codes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  const start = page.getByRole('combobox', { name: 'Starting from', exact: true })
  const next = page.getByRole('combobox', { name: 'Next class / destination', exact: true })
  await expect(start).toHaveValue('')
  await expect(next).toHaveValue('')
  await start.click()
  await expect(page.getByRole('option')).toHaveCount(13)
  await start.fill('village')
  await expect(page.getByRole('option')).toHaveCount(1)
  await page.getByRole('option', { name: 'USC Village', exact: true }).click()
  await expect(start).toHaveValue('USC Village')
  await next.click()
  await next.fill('TCC')
  await next.press('ArrowDown')
  await next.press('Enter')
  await expect(next).toHaveValue('Tutor Campus Center')
  await next.click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
  await next.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('time edits refresh real eligibility and ranking before another Find click', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  const names = () => page.getByRole('article').getByRole('heading').allTextContents()
  const short = await names()
  await page.getByLabel('End time', { exact: true }).fill('14:00')
  await page.getByLabel('End time', { exact: true }).press('Tab')
  await expect(page.getByText(/60 minutes available/)).toBeVisible()
  expect(await names()).not.toEqual(short)
  await expect(page.getByRole('article')).toHaveCount(3)
  const filters = page
    .getByRole('group', { name: 'Spot preferences', exact: true })
    .getByRole('button')
  await expect(filters.nth(0)).toHaveText('Indoors')
  await expect(filters.nth(1)).toHaveText('Outdoors')
  await filters.nth(0).click()
  const longIndoor = await names()
  await page.getByLabel('End time', { exact: true }).fill('13:15')
  await page.getByLabel('End time', { exact: true }).press('Tab')
  await expect(page.getByText(/15 minutes available/)).toBeVisible()
  expect(await names()).not.toEqual(longIndoor)
  await expect(filters.nth(0)).toHaveAttribute('aria-pressed', 'true')
})
