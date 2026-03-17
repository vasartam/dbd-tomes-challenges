'use client'
import { makeAutoObservable } from 'mobx'

export type Language = 'en' | 'ru'

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    'nav.tomes': 'Tomes', 'nav.search': 'Search', 'nav.admin': 'Admin', 'nav.logout': 'Logout',
    'auth.login': 'Login', 'auth.register': 'Register', 'auth.title': 'Archive Tomes Tracker',
    'auth.username': 'Username', 'auth.password': 'Password', 'auth.minPassword': 'Minimum 6 characters',
    'auth.loginBtn': 'Sign In', 'auth.registerBtn': 'Sign Up',
    'tomes.title': 'Archive Tomes', 'tomes.allTomes': 'All Tomes', 'tomes.otherTomes': 'Other Content',
    'tomes.loading': 'Loading...', 'tomes.empty': 'Catalog is empty. Run sync from the Admin panel.',
    'tomes.permanent': 'Permanent content',
    'tome.page': 'Page', 'tome.pageHeader': 'Page {n} — {count} challenges',
    'tome.noChallenges': 'No challenges on this page', 'tome.completed': 'Completed',
    'challenge.survivor': 'Survivor', 'challenge.killer': 'Killer', 'challenge.shared': 'Any',
    'challenge.prologue': 'Prologue', 'challenge.epilogue': 'Epilogue', 'challenge.reward': 'Reward',
    'challenge.completeFirst': 'Complete first: {name}',
    'challenge.completeOneOf': 'Complete one of: {names}',
    'challenge.unmarkFirst': 'Unmark first: {names}',
    'challenge.autoNode': 'Prologue and epilogue are completed automatically',
    'search.title': 'Search Challenges', 'search.placeholder': 'Name or description...',
    'search.noResults': 'No challenges found', 'search.searching': 'Searching...',
    'search.found': 'Found: {n}', 'search.foundMany': 'Showing {shown} of {total}', 'search.page': 'Page',
    'search.filters.allRoles': 'All roles', 'search.filters.all': 'All',
    'search.filters.completed': 'Completed', 'search.filters.available': 'Available',
    'admin.title': 'Admin Panel', 'admin.sync': 'Catalog Sync',
    'admin.syncDesc': 'Fetches latest data from dbd.tricky.lol and saves to database.',
    'admin.syncBtn': 'Run Sync', 'admin.syncResult': 'Result',
    'admin.syncSuccess': 'Catalog synced successfully',
    'admin.syncResultText': 'Synced: {tomes} tomes, {pages} pages, {challenges} challenges',
    'admin.scrapeIcons': 'Challenge Icons', 'admin.scrapeIconsDesc': 'Downloads challenge icons from the DBD wiki and saves them locally.',
    'admin.scrapeIconsBtn': 'Download Icons', 'admin.scrapeIconsStarted': 'Icon scraping started in background',
    'admin.scrapeIconsRunning': 'Already running',
    'admin.scrapeIconsProgress': 'Downloading: {current} / {total}',
    'admin.scrapeIconsLastRun': 'Last run: {date}',
    'admin.scrapeIconsLastStats': '{matched} icons found, {downloaded} downloaded',
    'admin.syncLastRun': 'Last run: {date}',
    'admin.syncLastStats': 'Synced: {tomes} tomes, {pages} pages, {challenges} challenges',
    'admin.depsSaved': 'Dependencies saved', 'admin.users': 'Users',
    'admin.userAdmin': 'Administrator', 'admin.userRegular': 'User',
    'admin.deps.title': 'Dependency Editor', 'admin.deps.openEditor': 'Open dependency editor',
    'admin.deps.tome': 'Tome', 'admin.deps.page': 'Page',
    'admin.deps.selectTome': 'Select tome', 'admin.deps.selectPage': 'Select page',
    'admin.deps.clickToEdit': 'Click a node to edit dependencies:',
    'admin.deps.search': 'Search by name or description',
    'admin.deps.dependencies': 'Dependencies', 'admin.deps.challenge': 'Challenge',
    'admin.deps.currentParents': 'Current parents ({n}):',
    'admin.deps.noParents': 'No parents (entry point)',
    'admin.deps.currentChildren': 'Current children ({n}):',
    'admin.deps.noChildren': 'No children', 'admin.deps.selectParents': 'Parents:', 'admin.deps.selectChildren': 'Children:',
    'admin.deps.noChallenges': 'No challenges on this page',
  },
  ru: {
    'nav.tomes': 'Тома', 'nav.search': 'Поиск', 'nav.admin': 'Админ', 'nav.logout': 'Выйти',
    'auth.login': 'Вход', 'auth.register': 'Регистрация', 'auth.title': 'Трекер заданий архивов',
    'auth.username': 'Никнейм', 'auth.password': 'Пароль', 'auth.minPassword': 'Минимум 6 символов',
    'auth.loginBtn': 'Войти', 'auth.registerBtn': 'Зарегистрироваться',
    'tomes.title': 'Тома архивов', 'tomes.allTomes': 'Все тома', 'tomes.otherTomes': 'Другой контент',
    'tomes.loading': 'Загрузка...', 'tomes.empty': 'Каталог пуст. Запустите синхронизацию в панели администратора.',
    'tomes.permanent': 'Постоянный контент',
    'tome.page': 'Страница', 'tome.pageHeader': 'Страница {n} — {count} заданий',
    'tome.noChallenges': 'На этой странице нет заданий', 'tome.completed': 'Выполнено',
    'challenge.survivor': 'Выживший', 'challenge.killer': 'Убийца', 'challenge.shared': 'Любой',
    'challenge.prologue': 'Пролог', 'challenge.epilogue': 'Эпилог', 'challenge.reward': 'Награда',
    'challenge.completeFirst': 'Сначала выполните задание «{name}»',
    'challenge.completeOneOf': 'Сначала выполните одно из заданий: {names}',
    'challenge.unmarkFirst': 'Сначала снимите отметку с заданий: {names}',
    'challenge.autoNode': 'Пролог и эпилог выполняются автоматически',
    'search.title': 'Поиск заданий', 'search.placeholder': 'Название или описание...',
    'search.noResults': 'Ничего не найдено', 'search.searching': 'Поиск...',
    'search.found': 'Найдено: {n}', 'search.foundMany': 'Показано {shown} из {total}', 'search.page': 'Стр.',
    'search.filters.allRoles': 'Все роли', 'search.filters.all': 'Все',
    'search.filters.completed': 'Выполнено', 'search.filters.available': 'Доступные',
    'admin.title': 'Админ-панель', 'admin.sync': 'Синхронизация каталога',
    'admin.syncDesc': 'Загружает актуальные данные с dbd.tricky.lol и сохраняет в базу.',
    'admin.syncBtn': 'Запустить синхронизацию', 'admin.syncResult': 'Результат',
    'admin.syncSuccess': 'Каталог успешно синхронизирован',
    'admin.syncResultText': 'Синхронизировано: {tomes} томов, {pages} страниц, {challenges} заданий',
    'admin.scrapeIcons': 'Иконки заданий', 'admin.scrapeIconsDesc': 'Скачивает иконки заданий из вики DBD и сохраняет локально.',
    'admin.scrapeIconsBtn': 'Скачать иконки', 'admin.scrapeIconsStarted': 'Скачивание иконок запущено в фоне',
    'admin.scrapeIconsRunning': 'Уже выполняется',
    'admin.scrapeIconsProgress': 'Скачивание: {current} / {total}',
    'admin.scrapeIconsLastRun': 'Последний запуск: {date}',
    'admin.scrapeIconsLastStats': 'Найдено {matched} иконок, скачано {downloaded}',
    'admin.syncLastRun': 'Последний запуск: {date}',
    'admin.syncLastStats': 'Синхронизировано: {tomes} томов, {pages} страниц, {challenges} заданий',
    'admin.depsSaved': 'Зависимости сохранены', 'admin.users': 'Пользователи',
    'admin.userAdmin': 'Администратор', 'admin.userRegular': 'Пользователь',
    'admin.deps.title': 'Редактор зависимостей', 'admin.deps.openEditor': 'Открыть редактор зависимостей',
    'admin.deps.tome': 'Том', 'admin.deps.page': 'Страница',
    'admin.deps.selectTome': 'Выберите том', 'admin.deps.selectPage': 'Выберите страницу',
    'admin.deps.clickToEdit': 'Кликните на узел для редактирования зависимостей:',
    'admin.deps.search': 'Поиск по названию или описанию',
    'admin.deps.dependencies': 'Зависимости', 'admin.deps.challenge': 'Задание',
    'admin.deps.currentParents': 'Текущие родители ({n}):',
    'admin.deps.noParents': 'Нет родителей (точка входа)',
    'admin.deps.currentChildren': 'Текущие дети ({n}):',
    'admin.deps.noChildren': 'Нет детей', 'admin.deps.selectParents': 'Родители:', 'admin.deps.selectChildren': 'Дети:',
    'admin.deps.noChallenges': 'Нет заданий на этой странице',
  },
}

class LanguageStore {
  lang: Language = 'en'

  constructor() {
    makeAutoObservable(this)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('app_language')
      if (stored === 'en' || stored === 'ru') this.lang = stored as Language
      else if (navigator.language.toLowerCase().startsWith('ru')) this.lang = 'ru'
    }
  }

  setLang(lang: Language) {
    this.lang = lang
    if (typeof window !== 'undefined') localStorage.setItem('app_language', lang)
  }

  t(key: string, vars?: Record<string, string | number>): string {
    let str = TRANSLATIONS[this.lang][key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return str
  }
}

export const langStore = new LanguageStore()
