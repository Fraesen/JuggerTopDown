import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('first visit')) return
  await page.addInitScript(() => {
    window.localStorage.setItem('juggerTopDown.playerName', 'Testspieler')
  })
})

async function startBotGame(page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Spiel gegen Bots|Play against bots/ }).click()
  await expect(page.locator('.game-shell')).toBeVisible()
  await expect(page.locator('#game')).toBeVisible()
}

test.describe('main navigation', () => {
  test('asks for a player name on first visit', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#profile-modal')).toBeVisible()
    await page.locator('#profile-name-input').fill('Ada')
    await page.getByRole('button', { name: /Speichern/ }).click()
    await expect(page.locator('#profile-modal')).toBeHidden()
    const storedName = await page.evaluate(() => window.localStorage.getItem('juggerTopDown.playerName'))
    expect(storedName).toBe('Ada')
  })

  test('shows menu actions, theme switcher and docs', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#menu-cinema')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spiel gegen Bots|Play against bots/ })).toBeVisible()
    await expect(page.locator('#theme-select')).toBeVisible()

    await page.locator('#theme-select').selectOption('ember')
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'ember')

    await page.getByRole('button', { name: /Docs/ }).click()
    await expect(page.locator('.docs-view')).toBeVisible()
    await expect(page.getByRole('heading', { name: /JuggerTopDown|Jugger Autobattler/ })).toBeVisible()
  })

  test('opens create and join PvP modals', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Spiel erstellen|Create game/ }).click()
    await expect(page.locator('#pvp-modal')).toBeVisible()
    await expect(page.getByRole('button', { name: /Raum erstellen|Create room/ })).toBeVisible()

    await page.locator('#pvp-modal-close').click()
    await page.getByRole('button', { name: /Spiel beitreten|Join game/ }).click()
    await expect(page.locator('#pvp-modal')).toBeVisible()
    await expect(page.getByPlaceholder(/Code/)).toBeVisible()
  })
})

test.describe('bot match UI', () => {
  test('starts a bot match and exposes core HUD', async ({ page }) => {
    await startBotGame(page)
    await expect(page.locator('.score-strip')).toBeVisible()
    await expect(page.locator('#clock')).toContainText(/03:00|02:/)
    await expect(page.locator('#mini-map')).toBeVisible()
    await expect(page.locator('#possession')).toBeVisible()
    await expect(page.locator('.game-shell')).toHaveClass(/drawer-collapsed/)
    await page.locator('#drawer-toggle').click()
    await expect(page.locator('.game-shell')).not.toHaveClass(/drawer-collapsed/)
    await expect(page.locator('.command-panel')).toBeVisible()
    await expect(page.locator('#local-skill-panel')).toBeVisible()
    await expect(page.locator('.command-panel #pins')).toBeHidden()
  })

  test('shows player hover tooltip', async ({ page }) => {
    await startBotGame(page)
    const canvas = page.locator('#game')
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()
    const candidates = [
      [0.04, 0.5],
      [0.08, 0.5],
      [0.12, 0.42],
      [0.12, 0.58],
      [0.88, 0.5],
      [0.92, 0.5],
    ]
    for (const [x, y] of candidates) {
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y)
      if (await page.locator('#player-tooltip').isVisible()) break
    }
    await expect(page.locator('#player-tooltip')).toBeVisible()
    await expect(page.locator('#player-tooltip')).toContainText(/Technik|Technique/)
  })

  test('supports all color themes @screenshots', async ({ page }, testInfo) => {
    await startBotGame(page)
    for (const theme of ['classic', 'floodlight', 'ember', 'chalk']) {
      await page.locator('#theme-select').selectOption(theme)
      await expect(page.locator('body')).toHaveAttribute('data-theme', theme)
      await page.screenshot({
        path: testInfo.outputPath(`theme-${theme}-${testInfo.project.name}.png`),
        fullPage: true,
      })
    }
  })
})

test.describe('responsive views @screenshots', () => {
  test('captures menu and bot match', async ({ page }, testInfo) => {
    await page.goto('/')
    await page.screenshot({ path: testInfo.outputPath(`menu-${testInfo.project.name}.png`), fullPage: true })
    await startBotGame(page)
    await page.screenshot({ path: testInfo.outputPath(`bot-live-${testInfo.project.name}.png`), fullPage: true })
  })
})
