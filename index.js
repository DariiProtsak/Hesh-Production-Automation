require('dotenv').config(); 
const { chromium } = require('playwright');
const fs = require('fs');

// -----------------
// Словник текстів (UA + EN)
// -----------------
const dict = {
  email: ["Електронна пошта", "Email"],
  password: ["Пароль", "Password"],
  inheritAttributes: [
    "Наслідувати атрибути",
    "Наслідувати атрибути від основного виробництва",
    "Inherit attributes",
    "Inherit attributes from the main production"
  ],
  productionButton: ["Виробництво", "Production"],
  launch: ["Запуск", "Launch"],
  launchProduction: ["Запуск виробництва", "Launch production"],
};

// Утиліта для генерації селектора з масиву текстів
function textSelector(tag, texts) {
  return texts.map(t => `${tag}:has-text("${t}")`).join(", ");
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); 
  page.setViewportSize({ width: 1920, height: 1080 });

  try {
    // -----------------
    // Авторизація
    // -----------------
    await page.goto('https://splem.hesh.app/login', { waitUntil: 'networkidle' });

    // Чекаємо поле email (ua/en варіанти)
    const emailInput = page.locator(
      `input[id="${dict.email[0]}"], input[id="${dict.email[1]}"]`
    );
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(process.env.LOGIN_EMAIL);

    // Чекаємо поле password (ua/en варіанти)
    const passwordInput = page.locator(
      `input[id="${dict.password[0]}"], input[id="${dict.password[1]}"]`
    );
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(process.env.LOGIN_PASSWORD);

    // Сабмітимо форму і чекаємо переходу
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }),
      page.click('button[type="submit"]'),
    ]);

    // -----------------
    // Вибір компанії (якщо є)
    // -----------------
    if (page.url().includes('/select-company')) {
      await page.waitForSelector('button:has-text("Splem")', { timeout: 10000 });
      await page.click('button:has-text("Splem")');
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });
    }

    // -----------------
    // Перехід на сторінку виробництв
    // -----------------
    await page.goto('https://splem.hesh.app/production', { waitUntil: 'networkidle' });
    await page.waitForSelector('.actions-panel_select_button__-vGX7', { timeout: 10000 }); 

    const selectButton = page.locator('.actions-panel_select_button__-vGX7').first();
    await selectButton.click({ force: true });

    const wrappers = page.locator('.production-checkbox-wrapper_production_wrapper__tF6xz');
    const count = await wrappers.count();
    let selectedCount = 0;

    for (let i = 0; i < count; i++) {
      const wrapper = wrappers.nth(i);

      // Пропускаємо дочірні
      const isChildMarker = await wrapper.locator(
        dict.inheritAttributes.map(t => `b.production-item_checkbox_title__Rc6Wx:has-text("${t}")`).join(", ")
      ).count();
      if (isChildMarker > 0) continue;

      // Перевірка статусу "Зробити"
      const statusExists = await wrapper.locator('.status-selector_to_do__mE-UQ').count();
      if (statusExists === 0) continue;

      // Вибираємо input
      const checkbox = await wrapper.locator('input.PrivateSwitchBase-input[type="checkbox"]').elementHandle();
      if (!checkbox) continue;

      // Використовуємо JS клік по прихованому input
      await page.evaluate((el) => {
        el.click();
      }, checkbox);

      // Перевіряємо, чи став checked
      const isChecked = await wrapper.locator('input.PrivateSwitchBase-input[type="checkbox"]').isChecked();
      if (isChecked) selectedCount++;

      await page.waitForTimeout(200); // пауза після кліку
    }

    console.log(`🔍 Вибрано батьківських виробництв: ${selectedCount}`);

    // -----------------
    // Натискаємо кнопку "Запуск"/"Launch"
    // -----------------
    const launchButton = page.locator(
      '#action_items_container div.action-item_action_item__YpJs1.action-item_blue__eS5V2'
    ).first();
    await launchButton.waitFor({ state: 'visible', timeout: 10000 });
    await launchButton.scrollIntoViewIfNeeded();
    await launchButton.click({ force: true });
    console.log(`✅ Кнопка "Запуск"/"Launch" натиснута`);

    // -----------------
    // Модальне вікно
    // -----------------
    await page.waitForSelector('div.MuiDialog-root.MuiModal-root', { timeout: 10000 });
    const modalRoot = page.locator('div.MuiDialog-root.MuiModal-root').first();
    const chipsContainer = modalRoot.locator('div.products-launch-modal-header_chips_container__c2uGd');
    await chipsContainer.waitFor({ state: 'visible', timeout: 10000 });

    const productChips = chipsContainer.locator(':scope > div');
    const chipCount = await productChips.count();
    console.log(`🔍 Знайдено ${chipCount} продуктів у модалці`);

    let childProcessedCount = 0;

    for (let i = 0; i < chipCount; i++) {
      const chip = productChips.nth(i);
      await chip.click({ timeout: 3000 }).catch(() => console.warn(`⚠️ Не вдалося вибрати продукт ${i+1}`));
      await page.waitForTimeout(1000); // пауза після кліку на чіп

      const containers = modalRoot.locator('.production-item_container__GANbW');
      const containersCount = await containers.count();

      // Спочатку визначаємо, чи є батьківські і дочірні контейнери
      let hasParentContainers = false;
      let childContainers = [];

      for (let j = 0; j < containersCount; j++) {
        const container = containers.nth(j);
        const isChild = (await container.locator(
          dict.inheritAttributes.map(t => `b.production-item_checkbox_title__Rc6Wx:has-text("${t}")`).join(", ")
        ).count()) > 0;

        if (isChild) {
          childContainers.push(j);
        } else {
          hasParentContainers = true;
        }
      }

      console.log(`📊 Продукт ${i+1}: батьківських - ${hasParentContainers ? 'так' : 'ні'}, дочірних - ${childContainers.length}`);

      // Логіка обробки згідно з вимогами:
      if (hasParentContainers && childContainers.length > 0) {
        console.log(`🎯 Обробляємо дочірні контейнери (батьківські пропускаємо)`);

        for (const childIndex of childContainers) {
          const container = containers.nth(childIndex);
          const prodButtons = container.locator(textSelector("button", dict.productionButton));

          if ((await prodButtons.count()) === 0) continue;

          await prodButtons.first().click({ force: true, timeout: 3000 });
          childProcessedCount++;
          console.log(`✅ Клікнуто "Виробництво" для дочірнього контейнера ${childIndex + 1}`);
          await page.waitForTimeout(200);
        }
      } else if (!hasParentContainers && childContainers.length > 0) {
        console.log(`⏭️ Знайдено тільки дочірні без батьківських - пропускаємо`);
      } else if (hasParentContainers && childContainers.length === 0) {
        console.log(`⏭️ Знайдено тільки батьківські контейнери - пропускаємо`);
      } else {
        console.log(`❓ Незрозуміла структура продукту ${i+1} - пропускаємо`);
      }

      await page.waitForTimeout(700); // пауза перед переходом до наступного чіпса
    }

    console.log(`🎯 Загалом оброблено контейнерів: ${childProcessedCount}`);

    // -----------------
    // Підтверджуємо запуск
    // -----------------
    const modalLaunchButton = modalRoot.locator(
      textSelector("button.products-launch-modal-footer_launchButton__Cmg78", dict.launch)
    ).first();

    await page.waitForTimeout(500);
    await modalLaunchButton.scrollIntoViewIfNeeded();
    await modalLaunchButton.click({ force: true });
    console.log(`✅ Кнопка "Запуск"/"Launch" у модальному вікні натиснута`);

    try {
      const productLaunchButton = page.locator(
        textSelector("button", dict.launchProduction)
      ).first();
      await productLaunchButton.scrollIntoViewIfNeeded();
      await productLaunchButton.click({ force: true });
      console.log(`✅ Кнопка "Запуск виробництва"/"Launch production" натиснута`);
    } catch (err) {
      console.error(`❌ Не вдалося натиснути "Запуск виробництва"/"Launch production"`);
    }

    const timestamp = new Date().toISOString();
    fs.appendFileSync('log.txt', `✅ Запущено ${selectedCount} батьківських та оброблено ${childProcessedCount} дочірніх о ${timestamp}\n`);

  } catch (error) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync('log.txt', `❌ Помилка о ${timestamp}: ${error.message}\n`);
    console.error(error);
  } finally {
    await browser.close();
  }
})();
