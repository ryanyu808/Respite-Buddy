import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import bundle from '../src/data/respite-demo.json' with { type: 'json' }
import { DEFAULT_FILTERS } from '../src/smartFilters'

function fixture() {
  return {
    ...bundle.response,
    mode: 'live',
    recommendations: bundle.response.recommendations.map((r, i) => ({
      ...r,
      spot: {
        ...r.spot,
        data_kind: 'scouted',
        name: `TEST ONLY space ${i + 1}`,
        verified_by: 'AUTOMATED TEST FIXTURE — not real observations',
        verified_date: '2026-10-17',
        outlets: i > 0 ? true : null,
      },
    })),
  }
}
async function mockRecommendations(page: Page) {
  const calls: any[] = [],
    source = fixture()
  await page.route('**/api/reset-spots', async (route) => {
    const input = route.request().postDataJSON()
    calls.push(input)
    const result = {
      ...source,
      recommendations: source.recommendations.filter(
        (r) => !input.filters?.outlets || r.spot.outlets === true,
      ),
    }
    await route.fulfill({ json: result })
  })
  await page.route('**/api/reset-spots/swap', async (route) => {
    const input = route.request().postDataJSON()
    calls.push(input)
    await route.fulfill({
      json: {
        ...source,
        minutes: 8,
        recommendations: source.recommendations.filter(
          (r) =>
            r.spot.id !== input.spot_id &&
            (!input.request.filters?.outlets || r.spot.outlets === true),
        ),
      },
    })
  })
  return calls
}
test('one tap yields a best recommendation with no questions or required setup', async ({
  page,
}) => {
  const calls = await mockRecommendations(page)
  await page.goto('/?live=1')
  const main = page.getByRole('main')
  await expect(main.getByRole('button')).toHaveCount(1)
  await expect(main.getByRole('slider')).toHaveCount(0)
  await expect(main.getByRole('combobox')).toHaveCount(0)
  await expect(
    page.getByText(/Default campus starting point \(not your current location\)/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Somewhere calm, now', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.locator('.reset-route')).toHaveCount(0)
  await expect(page.getByRole('article')).toContainText('TEST ONLY space 1')
  expect(calls[0]).toMatchObject({ minutes: 15, near: 'Leavey Library', next_class: null })
  expect(calls[0].filters).toEqual(DEFAULT_FILTERS)
  await expect(page.getByRole('button', { name: 'Backup options (2)', exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([])
})
test('optional outlet filter recalculates immediately; full uses an eligible backup and original deadline', async ({
  page,
}) => {
  const calls = await mockRecommendations(page)
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Somewhere calm, now', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByText('Adjust · optional filters', { exact: true }).click()
  await page.getByRole('button', { name: 'Need an outlet', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('TEST ONLY space 2')
  expect(calls.at(-1).filters.outlets).toBe(true)
  expect(calls.at(-1).deadline).toBe(bundle.response.deadline)
  await page.getByRole('button', { name: 'It’s full', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('TEST ONLY space 3')
  expect(calls.at(-1).request.filters.outlets).toBe(true)
  expect(calls.at(-1).request.deadline).toBe(bundle.response.deadline)
  expect(await page.locator('.reset-status').innerText()).toContain('8 minutes remain')
})
test('incomplete context proceeds with a transparent default; empty state has two clear options', async ({
  page,
}) => {
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Somewhere calm, now', exact: true }).click()
  await expect(
    page.getByText("We're still confirming campus spaces.", { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Explore documented locations', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article')).not.toContainText('Verified by scouts')
})
test('saved strict filters are reused without questions and can be cleared', async ({ page }) => {
  await page.addInitScript(
    (filters) => localStorage.setItem('respite-buddy-smart-filters', JSON.stringify(filters)),
    { ...DEFAULT_FILTERS, outlets: true },
  )
  const calls = await mockRecommendations(page)
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Somewhere calm, now', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('TEST ONLY space 2')
  expect(calls[0].filters.outlets).toBe(true)
  await page.getByText('Adjust · optional filters', { exact: true }).click()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.getByRole('article')).toContainText('TEST ONLY space 1')
  expect(calls.at(-1).filters).toEqual(DEFAULT_FILTERS)
})
test('directory strict outlet and food filters show documented matches without promoting them', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'Campus spaces', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(34)
  await page.getByText('Adjust · optional filters', { exact: true }).click()
  await page.getByRole('button', { name: 'Need an outlet', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(6)
  await expect(page.getByRole('article').first()).toContainText('conditions unconfirmed')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.getByRole('button', { name: 'Food available for purchase', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('article').first()).toContainText(
    'Unknown — not implied by food sales',
  )
  await page.getByText('More filters', { exact: true }).click()
  await page.getByRole('button', { name: 'Open now', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByText(/No confirmed matches/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('saved schedule context supplies a deadline without questions or sending private titles', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-19T13:00:00-07:00'))
  const calls = await mockRecommendations(page)
  await page.goto('/?live=1')
  await page.getByRole('button', { name: 'My Schedule', exact: true }).click()
  await page.getByLabel('Course or event name', { exact: true }).fill('Private saved class')
  await page.getByLabel('First date', { exact: true }).fill('2026-10-19')
  await page.getByLabel('Starts', { exact: true }).fill('13:25')
  await page.getByLabel('Ends', { exact: true }).fill('14:25')
  await page.getByLabel('Building', { exact: true }).fill('Tutor Campus Center')
  await page.getByRole('button', { name: 'Add event', exact: true }).click()
  await expect(
    page.getByText('Saved locally. Review overlap warnings before planning gaps.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reset before class', exact: true }).click()
  await expect(page.getByText(/25 minutes before your next class\./).first()).toBeVisible()
  await page.getByRole('button', { name: 'Somewhere calm, now', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(1)
  expect(calls[0]).toMatchObject({
    minutes: 25,
    next_class: 'Tutor Campus Center',
    deadline: '2026-10-19T20:25:00Z',
  })
  expect(JSON.stringify(calls)).not.toContain('Private saved class')
  await expect(page.locator('.context-suggestion')).toHaveCount(1)
  await page.getByRole('button', { name: 'Dismiss suggestion', exact: true }).click()
  await expect(page.locator('.context-suggestion')).toHaveCount(0)
})
