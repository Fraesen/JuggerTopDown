import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('first visit')) return
  await page.addInitScript(() => {
    window.localStorage.setItem('juggerTopDown.playerName', 'Testspieler')
    window.localStorage.setItem('juggerTopDown.seenChangelogVersion', '1')
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
    await expect(page.locator('#changelog-modal')).toBeVisible()
    await page.locator('#changelog-modal-confirm').click()
    await expect(page.locator('#changelog-modal')).toBeHidden()
    const storedName = await page.evaluate(() => window.localStorage.getItem('juggerTopDown.playerName'))
    expect(storedName).toBe('Ada')
    const seenChangelog = await page.evaluate(() => window.localStorage.getItem('juggerTopDown.seenChangelogVersion'))
    expect(seenChangelog).toBe('1')
  })

  test('shows menu actions, theme switcher, docs and changelog', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#menu-cinema')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spiel gegen Bots|Play against bots/ })).toBeVisible()
    await expect(page.locator('#theme-select')).toBeVisible()

    await page.locator('#theme-select').selectOption('ember')
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'ember')

    await page.getByRole('button', { name: /Docs/ }).click()
    await expect(page.locator('.docs-view')).toBeVisible()
    await expect(page.getByRole('heading', { name: /JuggerTopDown|Jugger Autobattler/ })).toBeVisible()

    await page.getByRole('button', { name: /Changelog/ }).click()
    await expect(page.locator('#changelog-view')).toBeVisible()
    await expect(page.locator('#changelog-page-body')).toContainText('1.0.0')
  })

  test('shows unseen changelog after returning visits', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('juggerTopDown.seenChangelogVersion', '0')
    })
    await page.goto('/')
    await expect(page.locator('#profile-modal')).toBeHidden()
    await expect(page.locator('#changelog-modal')).toBeVisible()
    await expect(page.locator('#changelog-modal-body')).toContainText('1.0.0')
    await page.locator('#changelog-modal-close').click()
    await expect(page.locator('#changelog-modal')).toBeHidden()
    const seenChangelog = await page.evaluate(() => window.localStorage.getItem('juggerTopDown.seenChangelogVersion'))
    expect(seenChangelog).toBe('1')
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

  test('edits formation names inline and expands skills in formation cards', async ({ page }) => {
    await page.goto('/')
    await page.locator('#open-formation-btn').click()
    await expect(page.locator('#formation-manager-formation details[data-player-card]')).toHaveCount(5)
    const presetName = await page.locator('#formation-preset-name').inputValue()
    await page.locator('#formation-manager-formation input[data-player-name="1"]').fill('Ada')
    await page.locator('#formation-manager-presets button[data-save-formation-preset]').click()
    await expect(page.locator('#formation-manager-presets .formation-preset-feedback')).toContainText(/gespeichert|saved/i)
    await page.locator('#formation-preset-name').fill('Andere Aufstellung')
    await page.locator('#formation-manager-presets button[data-load-formation-preset]').click()
    await expect(page.locator('#formation-manager-presets .formation-preset-feedback')).toContainText(/geladen|loaded/i)
    await expect(page.locator('#formation-preset-name')).toHaveValue(presetName)
    await expect(page.locator('#formation-manager-formation input[data-player-name="1"]')).toHaveValue('Ada')
    const playerCard = page.locator('#formation-manager-formation details[data-player-card][data-player="1"]')
    await expect(playerCard.locator('summary small')).toContainText(/Skillen|Skills/)
    await playerCard.locator('summary').click()
    await expect(playerCard).toHaveAttribute('open', '')
    await expect(playerCard.locator('.stat-stack')).toBeVisible()
    await expect(playerCard.locator('.stat-control')).toHaveCount(3)
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
