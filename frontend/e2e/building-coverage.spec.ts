import { test, expect } from '@playwright/test'

test('JKP to Fisher works for the reported 1 PM–2:15 PM window without Render', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  await page.getByRole('combobox', { name: 'Starting from', exact: true }).fill('JKP')
  await page
    .getByRole('combobox', { name: 'Next class / destination', exact: true })
    .fill('USC Fisher Museum')
  await page.getByLabel('End time', { exact: true }).fill('14:15')
  await page.getByRole('button', { name: 'Find me a spot', exact: true }).click()
  await expect(page.getByText(/75 minutes available/)).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.demo-applied-journey')).toHaveText(
    'Popovich Hall (JKP) → USC Fisher Museum',
  )
  await expect(page.getByRole('article')).toHaveCount(3)
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
  await page.getByText('Building approach & entrance limits', { exact: true }).click()
  await expect(page.getByText(/not a verified entrance/, { exact: false }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Next destination', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'On to USC Fisher Museum.' })).toBeVisible()
  await expect(page.locator('.demo-map .walking-route-line').first()).toBeVisible()
})
