# AdventureCraft Core

Системно-независимое **ядро крафта** для [Foundry VTT](https://foundryvtt.com/) v14.

Версия модуля: **0.1.0** (см. `module.json`).

Распространяется под [лицензией MIT](LICENSE).

## Назначение

Этот модуль содержит движок крафта без привязки к конкретной RPG-системе:

- хаб крафта и браузер рецептов;
- хранение рецептов (`RecipeStore`), оркестрация крафта;
- права доступа по ролям, обучение мастерству;
- API `registerSystemAdapter` для подключения bridge-модулей.

Для игры в **D&D 5e** нужен bridge: [adventurecraft-dnd5e](https://github.com/Hestci/adventurecraft-dnd5e).

## Требования

- Foundry VTT **v14**
- Bridge-модуль системы (для DnD5e — `adventurecraft-dnd5e`)

## Установка

1. Клонируйте репозиторий в каталог модулей Foundry:

   ```
   Data/modules/adventurecraft-core/
   ```

   ```bash
   git clone https://github.com/Hestci/adventurecraft-core.git Data/modules/adventurecraft-core
   ```

2. Установите и включите bridge (для DnD5e — см. [adventurecraft-dnd5e](https://github.com/Hestci/adventurecraft-dnd5e)).

3. В настройках мира включите **AdventureCraft Core**, затем bridge.

4. После правок файлов обновите страницу Foundry (F5).

## Ветки

| Ветка | Назначение |
| --- | --- |
| `main` | Стабильная версия |
| `dev` | Разработка, незавершённые изменения |

## Репозитории

- **Core (этот репозиторий):** https://github.com/Hestci/adventurecraft-core
- **Bridge DnD5e:** https://github.com/Hestci/adventurecraft-dnd5e

## Разработка

Исходники в wiki-рабочей копии могут лежать в `source/adventurecraft-core/` рядом с документацией проекта. Канонический remote — GitHub выше.
