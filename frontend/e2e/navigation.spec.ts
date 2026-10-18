import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const labels = [
  'Find a spot',
  'My Schedule',
  'Plan a walk',
  'Campus spaces',
  'Our approach',
  'Behind the map',
]

test('desktop exposes exactly six destinations, preserves content and highlights the current view', async ({
  page,
}) => {
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/')
  const nav = page.locator('nav[aria-label="Main navigation"]')
  await expect(nav.getByRole('button')).toHaveText(labels)
  await expect(nav.getByText('More tools')).toHaveCount(0)
  await expect(nav.getByText('Live reset tools')).toHaveCount(0)
  await expect(nav.locator('[aria-current="page"]')).toHaveText('Find a spot')
  for (const label of ['My Schedule', 'Plan a walk', 'Campus spaces']) {
    await nav.getByRole('button', { name: label, exact: true }).click()
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label)
    await expect(nav.getByRole('button')).toHaveText(labels)
    if (label === 'My Schedule')
      await expect(page.getByRole('heading', { name: label })).toBeVisible()
    if (label === 'Plan a walk')
      await expect(page.getByRole('button', { name: 'Find My Route' })).toBeVisible()
    if (label === 'Campus spaces')
      await expect(page.getByLabel('Search campus spaces', { exact: true })).toBeVisible()
  }
  for (const label of ['Our approach', 'Behind the map']) {
    await nav.getByRole('button', { name: label, exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(nav.locator('[aria-current="page"]')).toHaveText(label)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(nav.locator('[aria-current="page"]')).toHaveText('Campus spaces')
  }
  await nav.getByRole('button', { name: 'Find a spot', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  for (const width of [1101, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const brand = await page.locator('.brand').boundingBox()
    const navigation = await nav.boundingBox()
    const controls = await page.locator('.header-end').boundingBox()
    expect(brand!.x + brand!.width).toBeLessThanOrEqual(navigation!.x)
    expect(navigation!.x + navigation!.width).toBeLessThanOrEqual(controls!.x)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: '../tmp/navigation-desktop.png' })
})

for (const width of [320, 768, 1100]) {
  test(`compact navigation at ${width}px supports keyboard, dismissal and every destination`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/api/**', (route) => route.abort())
    await page.goto('/')
      const nav = page.locator('nav[aria-label="Main navigation"]')
      const toggle = nav.locator('.navigation-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(nav.getByRole('button')).toHaveCount(1)
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(`#${await toggle.getAttribute('aria-controls')}`)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(nav.getByRole('button', { name: 'Find a spot', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await page.getByRole('button', { name: 'Toggle high contrast' }).click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: 'Toggle high contrast' }).click()
    for (const label of labels) {
      await toggle.click()
      await expect(nav.getByRole('button')).toHaveText(['Menu', ...labels])
      await nav.getByRole('button', { name: label, exact: true }).click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(nav.locator('[aria-current="page"]')).toHaveText(label)
      if (label === 'Our approach' || label === 'Behind the map') {
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
      }
      await expect(toggle).toBeFocused()
    }
    await toggle.click()
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `../tmp/navigation-${width}.png` })
  })
}
