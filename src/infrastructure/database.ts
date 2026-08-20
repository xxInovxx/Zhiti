import { Capacitor } from '@capacitor/core'
import type { QuizRepository } from './repository'
import { SqliteRepository } from './sqliteRepository'
import { WebRepository } from './webRepository'

export const repository: QuizRepository = Capacitor.isNativePlatform()
  ? new SqliteRepository()
  : new WebRepository()
