import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import catalog from '../src/data/location-photos.json' with { type: 'json' }

test('ships every credited photo as a real local JPEG with a source and reuse license', () => {
  expect(Object.keys(catalog.photos)).toHaveLength(22)
  for (const photo of Object.values(catalog.photos)) {
    expect(photo.source).toMatch(/^https:\/\/commons.wikimedia.org\/wiki\/File:/)
    expect(photo.license).toMatch(/CC|Public domain/)
    const path = resolve(process.cwd(), 'public', photo.src.slice(1))
    expect(existsSync(path)).toBe(true)
    expect([...readFileSync(path).subarray(0, 3)]).toEqual([255, 216, 255])
  }
})

test('directory card is photo-first, short and hides detail until requested', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/**', (route) => route.abort())
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Campus spaces', exact: true }).click()
  await page.getByLabel('Search campus spaces', { exact: true }).fill('Weingart')
  const card = page.getByRole('article')
  const photo = card.getByRole('img', { name: 'Leavey Library exterior', exact: true })
  await expect(photo).toBeVisible()
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await expect(card.getByText('Outlets', { exact: true })).toBeHidden()
  await expect(card.getByText('Food for purchase', { exact: true })).toBeHidden()
  await expect(card.getByRole('button', { name: 'Walk me there', exact: true })).toBeVisible()
  expect((await card.boundingBox())!.height).toBeLessThan(650)
  await page.screenshot({ path: '../tmp/calm-card-mobile.png', fullPage: true })
  await card.getByText('More info', { exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.getByText('Outlets', { exact: true })).toBeVisible()
  await expect(card.getByRole('link', { name: /Photo: Bestweekevr/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(card.getByText('Outlets', { exact: true })).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})

test('missing and failed photos stay calm and never block the walking action', async ({ page }) => {
  await page.route('**/locations/leavey.jpg', (route) => route.abort())
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Campus spaces', exact: true }).click()
  await page.getByLabel('Search campus spaces', { exact: true }).fill('Weingart')
  await expect(page.getByRole('article').getByText('Photo coming soon')).toBeVisible()
  await expect(
    page.getByRole('article').getByRole('button', { name: 'Walk me there', exact: true }),
  ).toBeEnabled()
  await page.getByLabel('Search campus spaces', { exact: true }).fill('Tutor Hall (RTH)')
  await expect(page.getByRole('article').getByText('Photo coming soon')).toBeVisible()
  await expect(page.getByRole('article').getByRole('img')).toHaveCount(0)
})

test('indoor demo and full reset cards retain times and actions without walls of text', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByText('Change preferences · time & indoor options', { exact: true }).click()
  await page.getByRole('button', { name: 'Indoors', exact: true }).click()
  await expect(page.getByRole('article').first().getByRole('img')).toBeVisible()
  await expect(
    page.getByRole('article').first().getByRole('button', { name: 'Walk me there', exact: true }),
  ).toBeVisible()
  await page.goto('/?demo=1&needs=indoor&next=TCC')
  const card = page.getByRole('article').first()
  await expect(card.getByRole('img')).toBeVisible()
  await expect(card.getByText('Crowd information unavailable.', { exact: true })).toBeHidden()
  await expect(card.getByText(/leave by · Pacific/)).toBeVisible()
  await card.getByRole('button', { name: 'Walk me there', exact: true }).click()
  await expect(page.locator('.reset-route .walking-route-line').first()).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})
