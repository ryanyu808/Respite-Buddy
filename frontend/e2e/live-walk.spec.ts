import { expect, test } from '@playwright/test'

// Can also run against the deployed frontend; never substitute a saved route or mock API.
test.use({ baseURL: process.env.ROUTING_SMOKE_FRONTEND_URL || 'http://127.0.0.1:5173' })

test('Alumni Park to Leavey Library renders a successful live API route', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#walk')
  await expect(page.locator('.app-footer')).toContainText('Real OpenStreetMap walking network')
  await page.getByRole('combobox', { name: 'Start', exact: true }).fill('Alumni Park')
  await page.getByRole('combobox', { name: 'Destination', exact: true }).fill('Leavey Library')
  const pending = page.waitForResponse(
    (response) => response.url().endsWith('/api/routes') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Find My Route', exact: true }).click()
  const response = await pending
  expect(response.status()).toBe(200)
  const result = await response.json()
  expect(result.routes.length).toBeGreaterThan(0)
  expect(result.routes[0].distance_m).toBeGreaterThan(0)
  await expect(page.getByLabel('Route comparison')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(/Saved demo result/, { selector: '.sr-only' })).toHaveCount(0)
  expect(errors).toEqual([])
})
