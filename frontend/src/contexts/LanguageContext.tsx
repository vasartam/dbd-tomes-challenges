import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type Language = 'en' | 'ru'

interface LanguageContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

// Переводы интерфейса
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Навигация
    'nav.tomes': 'Tomes',
    'nav.search': 'Search',
    'nav.admin': 'Admin',
    'nav.logout': 'Logout',

    // Аутентификация
    'auth.login': 'Login',
    'auth.register': 'Register',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm password',
    'auth.loginBtn': 'Sign In',
    'auth.registerBtn': 'Sign Up',
    'auth.alreadyHaveAccount': 'Already have an account?',
    'auth.dontHaveAccount': "Don't have an account?",

    // Тома
    'tomes.title': 'Archive Tomes',
    'tomes.loading': 'Loading...',

    // Страница тома
    'tome.page': 'Page',
    'tome.challenges': 'challenges',
    'tome.noChallenges': 'No challenges on this page',
    'tome.completed': 'Completed',

    // Задания
    'challenge.survivor': 'Survivor',
    'challenge.killer': 'Killer',
    'challenge.shared': 'Any',
    'challenge.prologue': 'Prologue',
    'challenge.epilogue': 'Epilogue',
    'challenge.reward': 'Reward',
    'challenge.completeFirst': 'Complete first:',
    'challenge.completeOneOf': 'Complete one of:',
    'challenge.unmarkFirst': 'Unmark first:',

    // Поиск
    'search.placeholder': 'Search challenges...',
    'search.noResults': 'No challenges found',
    'search.filters.role': 'Role',
    'search.filters.status': 'Status',
    'search.filters.all': 'All',
    'search.filters.completed': 'Completed',
    'search.filters.available': 'Available',
    'search.filters.locked': 'Locked',

    // Админка
    'admin.title': 'Admin Panel',
    'admin.sync': 'Catalog Sync',
    'admin.syncDesc': 'Fetches latest data from dbd.tricky.lol and saves to database.',
    'admin.syncBtn': 'Run Sync',
    'admin.syncResult': 'Result',
    'admin.users': 'Users',
    'admin.userAdmin': 'Administrator',
    'admin.userRegular': 'User',

    // Редактор зависимостей
    'admin.deps.title': 'Dependency Editor',
    'admin.deps.selectTome': 'Select tome',
    'admin.deps.selectPage': 'Select page',
    'admin.deps.autoLayout': 'Auto Layout (Linear)',
    'admin.deps.clickToEdit': 'Click a node to edit dependencies:',
    'admin.deps.search': 'Search by name or description',
    'admin.deps.currentParents': 'Current parents',
    'admin.deps.noParents': 'No parents (entry point)',
    'admin.deps.currentChildren': 'Current children',
    'admin.deps.noChildren': 'No children',
    'admin.deps.selectParents': 'Select parents:',
    'admin.deps.noChallenges': 'No challenges on this page',

    // Ошибки
    'error.syncFailed': 'Sync failed',
    'error.notFound': 'Not found',
    'error.unauthorized': 'Unauthorized',

    // Легенда графа
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
    'auth.username': 'Имя пользователя',
    'auth.password': 'Пароль',
    'auth.confirmPassword': 'Подтвердите пароль',
    'auth.loginBtn': 'Войти',
    'auth.registerBtn': 'Зарегистрироваться',
    'auth.alreadyHaveAccount': 'Уже есть аккаунт?',
    'auth.dontHaveAccount': 'Нет аккаунта?',

    // Тома
    'tomes.title': 'Тома архивов',
    'tomes.loading': 'Загрузка...',

    // Страница тома
    'tome.page': 'Страница',
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
    'challenge.completeFirst': 'Сначала выполните:',
    'challenge.completeOneOf': 'Сначала выполните одно из:',
    'challenge.unmarkFirst': 'Сначала снимите отметку с:',

    // Поиск
    'search.placeholder': 'Поиск заданий...',
    'search.noResults': 'Задания не найдены',
    'search.filters.role': 'Роль',
    'search.filters.status': 'Статус',
    'search.filters.all': 'Все',
    'search.filters.completed': 'Выполнено',
    'search.filters.available': 'Доступно',
    'search.filters.locked': 'Заблокировано',

    // Админка
    'admin.title': 'Админ-панель',
    'admin.sync': 'Синхронизация каталога',
    'admin.syncDesc': 'Загружает актуальные данные с dbd.tricky.lol и сохраняет в базу.',
    'admin.syncBtn': 'Запустить синхронизацию',
    'admin.syncResult': 'Результат',
    'admin.users': 'Пользователи',
    'admin.userAdmin': 'Администратор',
    'admin.userRegular': 'Пользователь',

    // Редактор зависимостей
    'admin.deps.title': 'Редактор зависимостей',
    'admin.deps.selectTome': 'Выберите том',
    'admin.deps.selectPage': 'Выберите страницу',
    'admin.deps.autoLayout': 'Авто-расстановка (линейная)',
    'admin.deps.clickToEdit': 'Кликните на узел для редактирования зависимостей:',
    'admin.deps.search': 'Поиск по названию или описанию',
    'admin.deps.currentParents': 'Текущие родители',
    'admin.deps.noParents': 'Нет родителей (точка входа)',
    'admin.deps.currentChildren': 'Текущие дети',
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
    // Определяем язык браузера
    const browserLang = navigator.language.toLowerCase()
    return browserLang.startsWith('ru') ? 'ru' : 'en'
  })

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem(STORAGE_KEY, newLang)
  }

  const t = (key: string): string => {
    return translations[lang][key] || key
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
