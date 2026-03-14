import React, { createContext, useContext, useState, ReactNode } from 'react'

export type Language = 'en' | 'ru'

interface LanguageContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.tomes': 'Tomes',
    'nav.search': 'Search',
    'nav.admin': 'Admin',
    'nav.logout': 'Logout',

    // Auth
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.title': 'Archive Tomes Tracker',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.minPassword': 'Minimum 6 characters',
    'auth.loginBtn': 'Sign In',
    'auth.registerBtn': 'Sign Up',
    'auth.alreadyHaveAccount': 'Already have an account?',
    'auth.dontHaveAccount': "Don't have an account?",

    // Tomes list
    'tomes.title': 'Archive Tomes',
    'tomes.allTomes': 'All Tomes',
    'tomes.loading': 'Loading...',
    'tomes.empty': 'Catalog is empty. Run sync from the Admin panel.',
    'tomes.permanent': 'Permanent content',

    // Tome page
    'tome.page': 'Page',
    'tome.pageHeader': 'Page {n} — {count} challenges',
    'tome.challenges': 'challenges',
    'tome.noChallenges': 'No challenges on this page',
    'tome.completed': 'Completed',

    // Challenges
    'challenge.survivor': 'Survivor',
    'challenge.killer': 'Killer',
    'challenge.shared': 'Any',
    'challenge.prologue': 'Prologue',
    'challenge.epilogue': 'Epilogue',
    'challenge.reward': 'Reward',
    'challenge.completeFirst': 'Complete first: {name}',
    'challenge.completeOneOf': 'Complete one of: {names}',
    'challenge.unmarkFirst': 'Unmark first: {names}',

    // Search
    'search.title': 'Search Challenges',
    'search.placeholder': 'Name or description...',
    'search.noResults': 'No challenges found',
    'search.searching': 'Searching...',
    'search.found': 'Found: {n}',
    'search.page': 'Page',
    'search.filters.allRoles': 'All roles',
    'search.filters.role': 'Role',
    'search.filters.status': 'Status',
    'search.filters.all': 'All',
    'search.filters.completed': 'Completed',
    'search.filters.available': 'Available',
    'search.filters.locked': 'Locked',

    // Admin
    'admin.title': 'Admin Panel',
    'admin.sync': 'Catalog Sync',
    'admin.syncDesc': 'Fetches latest data from dbd.tricky.lol and saves to database.',
    'admin.syncBtn': 'Run Sync',
    'admin.syncResult': 'Result',
    'admin.syncSuccess': 'Catalog synced successfully',
    'admin.syncResultText': 'Synced: {tomes} tomes, {pages} pages, {challenges} challenges',
    'admin.depsSaved': 'Dependencies saved',
    'admin.users': 'Users',
    'admin.userAdmin': 'Administrator',
    'admin.userRegular': 'User',

    // Dependency editor
    'admin.deps.title': 'Dependency Editor',
    'admin.deps.tome': 'Tome',
    'admin.deps.page': 'Page',
    'admin.deps.selectTome': 'Select tome',
    'admin.deps.selectPage': 'Select page',
    'admin.deps.autoLayout': 'Auto Layout (Linear)',
    'admin.deps.clickToEdit': 'Click a node to edit dependencies:',
    'admin.deps.search': 'Search by name or description',
    'admin.deps.dependencies': 'Dependencies',
    'admin.deps.challenge': 'Challenge',
    'admin.deps.currentParents': 'Current parents ({n}):',
    'admin.deps.noParents': 'No parents (entry point)',
    'admin.deps.currentChildren': 'Current children ({n}):',
    'admin.deps.noChildren': 'No children',
    'admin.deps.selectParents': 'Select parents:',
    'admin.deps.noChallenges': 'No challenges on this page',

    // Errors
    'error.syncFailed': 'Sync failed',
    'error.notFound': 'Not found',
    'error.unauthorized': 'Unauthorized',

    // Graph legend
    'graph.legend.prologue': 'Prologue',
    'graph.legend.survivor': 'Survivor',
    'graph.legend.killer': 'Killer',
    'graph.legend.shared': 'Any',
    'graph.legend.epilogue': 'Epilogue',
  },
  ru: {
    // Навигация
    'nav.tomes': 'Тома',
    'nav.search': 'Поиск',
    'nav.admin': 'Админ',
    'nav.logout': 'Выйти',

    // Аутентификация
    'auth.login': 'Вход',
    'auth.register': 'Регистрация',
    'auth.title': 'Трекер заданий архивов',
    'auth.username': 'Никнейм',
    'auth.password': 'Пароль',
    'auth.minPassword': 'Минимум 6 символов',
    'auth.loginBtn': 'Войти',
    'auth.registerBtn': 'Зарегистрироваться',
    'auth.alreadyHaveAccount': 'Уже есть аккаунт?',
    'auth.dontHaveAccount': 'Нет аккаунта?',

    // Тома
    'tomes.title': 'Тома архивов',
    'tomes.allTomes': 'Все тома',
    'tomes.loading': 'Загрузка...',
    'tomes.empty': 'Каталог пуст. Запустите синхронизацию в панели администратора.',
    'tomes.permanent': 'Постоянный контент',

    // Страница тома
    'tome.page': 'Страница',
    'tome.pageHeader': 'Страница {n} — {count} заданий',
    'tome.challenges': 'заданий',
    'tome.noChallenges': 'На этой странице нет заданий',
    'tome.completed': 'Выполнено',

    // Задания
    'challenge.survivor': 'Выживший',
    'challenge.killer': 'Убийца',
    'challenge.shared': 'Любой',
    'challenge.prologue': 'Пролог',
    'challenge.epilogue': 'Эпилог',
    'challenge.reward': 'Награда',
    'challenge.completeFirst': 'Сначала выполните задание «{name}»',
    'challenge.completeOneOf': 'Сначала выполните одно из заданий: {names}',
    'challenge.unmarkFirst': 'Сначала снимите отметку с заданий: {names}',

    // Поиск
    'search.title': 'Поиск заданий',
    'search.placeholder': 'Название или описание...',
    'search.noResults': 'Ничего не найдено',
    'search.searching': 'Поиск...',
    'search.found': 'Найдено: {n}',
    'search.page': 'Стр.',
    'search.filters.allRoles': 'Все роли',
    'search.filters.role': 'Роль',
    'search.filters.status': 'Статус',
    'search.filters.all': 'Все',
    'search.filters.completed': 'Выполнено',
    'search.filters.available': 'Доступные',
    'search.filters.locked': 'Заблокировано',

    // Админка
    'admin.title': 'Админ-панель',
    'admin.sync': 'Синхронизация каталога',
    'admin.syncDesc': 'Загружает актуальные данные с dbd.tricky.lol и сохраняет в базу.',
    'admin.syncBtn': 'Запустить синхронизацию',
    'admin.syncResult': 'Результат',
    'admin.syncSuccess': 'Каталог успешно синхронизирован',
    'admin.syncResultText': 'Синхронизировано: {tomes} томов, {pages} страниц, {challenges} заданий',
    'admin.depsSaved': 'Зависимости сохранены',
    'admin.users': 'Пользователи',
    'admin.userAdmin': 'Администратор',
    'admin.userRegular': 'Пользователь',

    // Редактор зависимостей
    'admin.deps.title': 'Редактор зависимостей',
    'admin.deps.tome': 'Том',
    'admin.deps.page': 'Страница',
    'admin.deps.selectTome': 'Выберите том',
    'admin.deps.selectPage': 'Выберите страницу',
    'admin.deps.autoLayout': 'Авто-расстановка (линейная)',
    'admin.deps.clickToEdit': 'Кликните на узел для редактирования зависимостей:',
    'admin.deps.search': 'Поиск по названию или описанию',
    'admin.deps.dependencies': 'Зависимости',
    'admin.deps.challenge': 'Задание',
    'admin.deps.currentParents': 'Текущие родители ({n}):',
    'admin.deps.noParents': 'Нет родителей (точка входа)',
    'admin.deps.currentChildren': 'Текущие дети ({n}):',
    'admin.deps.noChildren': 'Нет детей',
    'admin.deps.selectParents': 'Выберите родителей:',
    'admin.deps.noChallenges': 'Нет заданий на этой странице',

    // Ошибки
    'error.syncFailed': 'Ошибка синхронизации',
    'error.notFound': 'Не найдено',
    'error.unauthorized': 'Не авторизован',

    // Легенда графа
    'graph.legend.prologue': 'Пролог',
    'graph.legend.survivor': 'Выживший',
    'graph.legend.killer': 'Убийца',
    'graph.legend.shared': 'Любой',
    'graph.legend.epilogue': 'Эпилог',
  },
}

const STORAGE_KEY = 'app_language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'ru') return stored
    return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  })

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem(STORAGE_KEY, newLang)
  }

  const t = (key: string, vars?: Record<string, string | number>): string => {
    let str = translations[lang][key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return str
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
