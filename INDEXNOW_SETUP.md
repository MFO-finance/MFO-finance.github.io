# Настройка Яндекс IndexNow

## Шаг 1 — Получить ключ

Перейдите на https://yandex.com/indexnow и зарегистрируйте ключ для домена `mfo-finance.github.io`.

## Шаг 2 — Разместить файл верификации

Создайте в **корне репозитория** текстовый файл с именем, равным вашему ключу:

```
<ВАШ_КЛЮЧ>.txt
```

Содержимое файла — просто ключ, одна строка:

```
abc123def456abc123def456
```

Файл должен быть доступен по URL:
`https://mfo-finance.github.io/<ВАШ_КЛЮЧ>.txt`

## Шаг 3 — Установить переменную окружения

```bash
# Windows PowerShell
$env:INDEXNOW_KEY = "abc123def456abc123def456"

# Также установите ключ Anthropic для generate-articles.js
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

## Использование

```bash
# Отправить все URL из sitemap.xml в Яндекс IndexNow
node scripts/indexnow.js

# Отправить конкретные URL
node scripts/indexnow.js /blog/luchshie-mfo-2026-zaym-onlayn-srochno/

# Сгенерировать статьи + автоматически отправить в IndexNow
node scripts/generate-articles.js

# Сгенерировать одну статью по ID
node scripts/generate-articles.js mfo-2026

# Сгенерировать первые 2 статьи
node scripts/generate-articles.js --limit=2
```

## Команды npm

```bash
npm run sitemap     # пересобрать sitemap.xml
npm run generate    # запустить генерацию статей (требует ANTHROPIC_API_KEY)
npm run indexnow    # отправить все URL в IndexNow (требует INDEXNOW_KEY)
npm run build       # = npm run sitemap (запускать перед git push)
```

## Структура проекта

```
/
├── index.html                          # Главная (МФО)
├── karty/index.html                    # Кредитные карты
├── kredity/index.html                  # Потребительские кредиты
├── kredity-pod-zalog-nedvizhimosti/    # Кредиты под залог
├── rko/index.html                      # РКО для бизнеса
├── blog/
│   ├── index.html                      # Список статей
│   └── [article-slug]/index.html       # AI-статьи (генерируются скриптом)
├── css/style.css                       # Единый стиль Evora Finance
├── js/main.js                          # Динамический рендеринг офферов
├── src/data/
│   ├── offers.json                     # Все финансовые офферы (источник правды)
│   └── keywords.json                   # Темы для генерации статей
├── scripts/
│   ├── build-sitemap.js                # Генератор sitemap.xml
│   ├── generate-articles.js            # AI-генератор SEO-статей
│   └── indexnow.js                     # Яндекс IndexNow клиент
├── sitemap.xml                         # Автогенерируется
├── <INDEXNOW_KEY>.txt                  # Создать вручную!
└── package.json
```
