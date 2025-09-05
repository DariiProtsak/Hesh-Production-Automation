# Базовий образ з Node.js і Playwright з усіма залежностями
FROM mcr.microsoft.com/playwright:focal

# Робоча папка в контейнері
WORKDIR /app

# Копіюємо package.json і package-lock.json (якщо є)
COPY package*.json ./

# Встановлюємо npm-залежності
RUN npm install

# Копіюємо весь код у контейнер
COPY . .

# Встановлення браузерів Playwright із додатковими залежностями
RUN npx playwright install --with-deps

# Запуск головного скрипту
CMD ["node", "index.js"]
