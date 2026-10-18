import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import bundle from '../src/data/respite-demo.json' with { type: 'json' }

test('primary recommendation, source labels, swaps, time window and safety preview', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Somewhere calm, now' }).click()
  await expect(page.getByText('No eligible spots for this break.')).toBeVisible()
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(3)
  await expect(page.getByText('Saved demonstration (works offline)')).toBeVisible()
  await expect(page.getByText('Crowd information unavailable.', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: 'Walk me there', exact: true }).first().click()
  await expect(page.locator('.reset-route .walking-route-line').first()).toBeVisible()
  const firstName = await page.getByRole('article').first().getByRole('heading').innerText()
  await page.getByRole('button', { name: 'It’s full', exact: true }).first().click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(2)
  await expect(page.getByRole('article').getByRole('heading', { name: firstName })).toHaveCount(0)
  await page.getByText('Other options', { exact: true }).first().click()
  await page.getByRole('button', { name: 'It’s locked', exact: true }).first().click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByText('Change preferences', { exact: false }).click()
  await page.getByLabel('Start time', { exact: true }).fill('13:00')
  await page.getByLabel('End time', { exact: true }).fill('13:30')
  await page.getByRole('button', { name: 'Calculate my break', exact: true }).click()
  await expect(page.getByText('Tight on time.', { exact: true })).toHaveCount(0)
  await page.getByLabel('End time', { exact: true }).fill('13:45')
  await page.getByRole('button', { name: 'Calculate my break', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByLabel('End time', { exact: true }).fill('13:15')
  await page.getByRole('button', { name: 'Calculate my break', exact: true }).click()
  await page.getByRole('checkbox', { name: /Preview 9 PM/ }).check()
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByText('Data notes & limitations', { exact: true }).click()
  await expect(page.getByText(/after.dark|DEMONSTRATION/i).first()).toBeVisible()
  expect(errors).toEqual([])
})

test('cold start can be superseded by an immediate saved demo; unmatched settings stay honest', async ({
  page,
}) => {
  let release: () => void = () => {}
  await page.route('**/api/reset-spots', async (route) => {
    if (!route.request().postDataJSON().demo)
      await new Promise<void>((resolve) => {
        release = resolve
      })
    await route.abort()
  })
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Somewhere calm, now' }).click()
  await expect(page.getByRole('button', { name: 'Finding your pause…' })).toBeVisible()
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(3, { timeout: 3000 })
  release()
  await page.getByText('Change preferences', { exact: false }).click()
  await page.getByText('Fine-tune', { exact: false }).first().click()
  await page.getByRole('combobox', { name: 'Starting near', exact: true }).fill('JKP')
  await expect(page.getByRole('alert')).toContainText('No saved demo matches these settings')
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('button', { name: 'Restart sample demo', exact: true }).click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(3)
})

test('engine deep links restore selected spot, next-class leg and private navigation context', async ({
  page,
}) => {
  const input = { ...bundle.request, next_class: 'TCC' }
  const response = await page.request.post('http://127.0.0.1:8000/api/reset-spots', { data: input })
  expect(response.ok()).toBe(true)
  const value = await response.json()
  const selected = value.recommendations[1] ?? value.recommendations[0]
  expect(selected).toBeTruthy()
  const link = new URL(selected.deep_link)
  await page.goto(`/${link.search}${link.hash}`)
  await expect(
    page.getByRole('heading', { name: `${selected.spot.name} · walking directions` }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'To next class', exact: true }).click()
  await expect(page.locator('.reset-route')).toContainText('From your reset spot to')
  await expect(page.locator('.reset-route .walking-route-line').first()).toBeVisible()
  await expect(page.locator('.reset-spot-card')).toHaveCount(value.recommendations.length)
  expect(await page.locator('.reset-status').innerText()).toContain(
    `${value.minutes} minutes remain`,
  )
})

test('mobile route action moves focus, preferences persist, and calendar is simulated', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?live=1')
  await page.getByText('Change preferences', { exact: false }).click()
  await page.getByRole('button', { name: 'Quiet', exact: true }).click()
  await page.getByLabel('Start time', { exact: true }).fill('13:00')
  await page.getByLabel('End time', { exact: true }).fill('13:45')
  await page.getByRole('button', { name: 'Calculate my break', exact: true }).click()
  await page.getByRole('button', { name: 'Toggle high contrast' }).click()
  await page.reload()
  await page.getByText('Change preferences', { exact: false }).click()
  await expect(page.getByRole('button', { name: 'Quiet', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText(/45 minutes available/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Toggle high contrast' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Preview calendar' }).click()
  await expect(page.getByText('Simulated calendar · not connected')).toBeVisible()
  await page.getByRole('button', { name: 'Try this sample break' }).click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(3)
  await page.getByRole('button', { name: 'Walk me there', exact: true }).last().click()
  await expect(page.locator('.reset-route')).toBeFocused()
  await expect(page.locator('.reset-route')).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '../tmp/respite-mobile-verified.png', fullPage: true })
  await page.getByText('Fine-tune', { exact: false }).first().click()
  await page.getByRole('button', { name: 'Clear saved preferences' }).click()
  await expect(page.getByRole('button', { name: 'Quiet', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

test('keyboard and WCAG checks on initial, results and high contrast views', async ({ page }) => {
  await page.goto('/?live=1')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to reset controls' })).toBeFocused()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  await page.getByText('Change preferences', { exact: false }).click()
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.locator('.reset-spot-card')).toHaveCount(3)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
  await page.getByRole('button', { name: 'Toggle high contrast' }).click()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
})
