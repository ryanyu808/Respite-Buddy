import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('real cached campus demo, preferences, assistant and map controls', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Plan a walk' }).click()
  await expect(page.getByRole('button', { name: 'Find My Route' })).toBeEnabled()
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: '../tmp/desktop-initial.png', fullPage: true })
  await page.getByRole('button', { name: 'Try a campus demo' }).click()
  await expect(page.getByLabel('Route comparison')).toBeVisible()
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Calmer route/ })).toBeVisible()
  await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible()
  await page.getByRole('button', { name: /Fastest route/ }).click()
  await expect(page.getByRole('button', { name: /Fastest route/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: /Calmer route/ }).click()
  await page.getByRole('button', { name: 'Fit selected route' }).click()
  await page.getByRole('checkbox', { name: 'Calmer', exact: true }).uncheck()
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#28735d"]')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Calmer', exact: true }).check()
  await expect(page.locator('.leaflet-overlay-pane path[stroke="#28735d"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Explain the tradeoff' }).click()
  await expect(page.locator('.explanation .mode-label')).toContainText(/rule-based|AI-assisted/)
  await page.getByRole('checkbox', { name: 'Potential rest stops' }).check()
  await page.screenshot({ path: '../tmp/desktop-results.png', fullPage: true })
  await page.getByRole('button', { name: 'Close route results' }).click()
  await page.getByRole('button', { name: 'Shortest walk', exact: true }).click()
  await page.getByRole('button', { name: 'Find My Route' }).click()
  await expect(page.getByLabel('Route comparison')).toBeVisible()
  await expect(page.locator('.route-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Close route results' }).click()
  await page
    .getByLabel('Describe your walking preferences')
    .fill('I prefer quiet green spaces and a few extra minutes')
  await page.getByRole('button', { name: 'Interpret preferences' }).click()
  await expect(page.getByText('Review your settings')).toBeVisible()
  await page.getByRole('button', { name: 'Apply & recalculate' }).click()
  await expect(page.getByLabel('Route comparison')).toBeVisible()
  await page.getByRole('button', { name: 'Behind the map' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('mobile layout, route results and invalid selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Plan a walk' }).click()
  await expect(page.getByRole('button', { name: 'Find My Route' })).toBeEnabled()
  await page.screenshot({ path: '../tmp/mobile-initial.png', fullPage: true })
  await page.getByRole('button', { name: 'Try a campus demo' }).click()
  await expect(page.getByLabel('Route comparison')).toBeVisible()
  await page.screenshot({ path: '../tmp/mobile-results.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Close route results' }).click()
  await page.getByRole('button', { name: 'Clear destination' }).click()
  await page.getByRole('button', { name: 'Find My Route' }).click()
  await expect(page.getByRole('alert')).toContainText('Choose both')
  await page.getByRole('button', { name: 'Set end', exact: true }).click()
  await page.locator('.walking-map').click({ position: { x: 180, y: 170 } })
  await expect(page.getByRole('combobox', { name: 'Destination', exact: true })).toHaveValue(
    'Map selection',
  )
})

test('keyboard, dialogs, and automated accessibility checks', async ({ page }) => {
  await page.goto('/#walk')
  await expect(page.getByRole('button', { name: 'Find My Route' })).toBeEnabled()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to route controls' })).toBeFocused()
  const initial = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(initial.violations).toEqual([])
  await page.getByRole('button', { name: 'Try a campus demo' }).click()
  await expect(page.getByLabel('Route comparison')).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations).toEqual([])
  await page.getByRole('button', { name: 'Toggle high contrast' }).click()
  await expect(page.getByRole('button', { name: 'Toggle high contrast' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Our approach' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
