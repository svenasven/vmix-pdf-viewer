# Разработка и сборка

Node.js 24+, npm. Окно и переносимая сборка — Windows x64.

```powershell
npm ci --omit=optional
npm test
npm run desktop
npm run build:win
```

Electron при установке загружает движок. Если установка выполнялась с
`--ignore-scripts`, перед окном выполните `node node_modules/electron/install.js`.
Готовому EXE отдельный Node.js не нужен.

`npm start` — сервер без окна с библиотекой в `data/`. Автотесты создают временные
библиотеки и используют свободные loopback-порты. Запущенный vMix им не нужен.
Только серверные зависимости: `npm ci --omit=dev --omit=optional`.

Сборки находятся в `release/`. Повторную упаковку выполняйте в новый каталог:

```powershell
npm run build:win -- --config.directories.output=release-new
```

GitHub Actions проверяет Windows и Linux с Node.js 24. Workflow Windows build
запускается вручную или по тегу `v*`, сохраняет EXE как артефакт и не публикует
релиз автоматически. Версии фиксирует package-lock.json.

Перед обновлением PDF.js проверяйте настоящий Browser Input vMix, шрифты,
повороты, большие документы, быстрые команды и освобождение задач PDF.js.
Тема не должна влиять на кадр и состояние показа. Для добавления изменений
смотрите [CONTRIBUTING.md](../CONTRIBUTING.md).
