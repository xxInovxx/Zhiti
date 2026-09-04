import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { AppSettings, AppSnapshot, LearningState, ModeProgress, PracticeSession, Question, QuizProject, SourceFile } from '@/domain/models'
import { emptySnapshot, normalizeSnapshot, type QuizRepository } from './repository'
import type { ImportQuestionType } from '@/modules/import/importTypes'

const DB_NAME = 'quiz_app'
const DB_VERSION = 1

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS source_files (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  imported_at TEXT NOT NULL,
  sheets_json TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  case_count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY NOT NULL,
  source_file_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  parent_id TEXT,
  node_type TEXT NOT NULL,
  answer_mode TEXT NOT NULL,
  stem TEXT NOT NULL,
  normalized_answer TEXT NOT NULL,
  accepted_answers_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  explanation TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  FOREIGN KEY (source_file_id) REFERENCES source_files(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS question_options (
  question_id TEXT NOT NULL,
  option_key TEXT NOT NULL,
  option_text TEXT NOT NULL,
  PRIMARY KEY (question_id, option_key),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_sources (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_order INTEGER NOT NULL,
  PRIMARY KEY (project_id, source_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES source_files(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS learning_states (
  question_id TEXT PRIMARY KEY NOT NULL,
  attempt_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  unanswered_count INTEGER NOT NULL,
  is_wrong_active INTEGER NOT NULL,
  is_favorite INTEGER NOT NULL,
  last_answer TEXT NOT NULL,
  last_result TEXT,
  last_answered_at TEXT,
  total_duration_ms INTEGER NOT NULL,
  note_text TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT,
  mode TEXT NOT NULL,
  entry_kind TEXT NOT NULL DEFAULT 'STANDARD',
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  deadline TEXT,
  unit_ids_json TEXT NOT NULL,
  current_index INTEGER NOT NULL,
  answers_json TEXT NOT NULL,
  graded_ids_json TEXT NOT NULL,
  correct_count INTEGER NOT NULL,
  wrong_count INTEGER NOT NULL,
  unanswered_count INTEGER NOT NULL,
  config_json TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  question_durations_json TEXT NOT NULL DEFAULT '{}'
  ,randomize_options INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mode_progress (
  project_id TEXT PRIMARY KEY NOT NULL,
  ordered_cursor INTEGER NOT NULL,
  random_queue_json TEXT NOT NULL,
  random_cursor INTEGER NOT NULL,
  random_signature TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  split_case_questions INTEGER NOT NULL,
  random_keep_option_order INTEGER NOT NULL DEFAULT 1,
  theme_mode TEXT NOT NULL DEFAULT 'SYSTEM',
  cumulative_practice_duration_ms INTEGER NOT NULL DEFAULT 0,
  cumulative_practice_count INTEGER NOT NULL DEFAULT 0,
  project_practice_counts_json TEXT NOT NULL DEFAULT '{}',
  project_order_json TEXT NOT NULL DEFAULT '[]'
);
INSERT OR IGNORE INTO app_settings (id, split_case_questions) VALUES (1, 1);
CREATE INDEX IF NOT EXISTS idx_questions_source ON questions(source_file_id);
CREATE INDEX IF NOT EXISTS idx_questions_parent ON questions(parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON practice_sessions(project_id);
`

export class SqliteRepository implements QuizRepository {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite)
  private db: SQLiteDBConnection | null = null

  async init(): Promise<void> {
    const consistency = await this.sqlite.checkConnectionsConsistency()
    const existing = (await this.sqlite.isConnection(DB_NAME, false)).result
    if (consistency.result && existing) {
      this.db = await this.sqlite.retrieveConnection(DB_NAME, false)
    } else {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)
    }
    await this.db.open()
    await this.db.execute(SCHEMA)
    await this.ensureLearningNoteColumn()
    await this.ensureQuestionAcceptedAnswersColumn()
    await this.ensureQuestionEnabledColumn()
    await this.ensureSessionTimingColumns()
    await this.ensureSessionEntryKindColumn()
    await this.ensureSessionRandomizeOptionsColumn()
    await this.ensureRandomKeepOptionOrderColumn()
    await this.ensureThemeModeColumn()
    await this.ensureCumulativePracticeDurationColumn()
    await this.ensureCumulativePracticeCountColumn()
    await this.ensureProjectPracticeCountsColumn()
    await this.ensureProjectOrderColumn()
  }

  async getSnapshot(): Promise<AppSnapshot> {
    const db = this.requireDb()
    const snapshot = emptySnapshot()
    const settingsRows = (await db.query('SELECT split_case_questions, random_keep_option_order, theme_mode, cumulative_practice_duration_ms, cumulative_practice_count, project_practice_counts_json, project_order_json FROM app_settings WHERE id = 1')).values ?? []
    snapshot.settings = {
      splitCaseQuestions: settingsRows[0]?.split_case_questions !== 0,
      randomKeepOptionOrder: settingsRows[0]?.random_keep_option_order !== 0,
      themeMode: ['LIGHT', 'DARK', 'SYSTEM'].includes(settingsRows[0]?.theme_mode)
        ? settingsRows[0].theme_mode : 'SYSTEM',
      totalPracticeDurationMs: Math.max(0, settingsRows[0]?.cumulative_practice_duration_ms ?? 0),
      totalPracticeCount: Math.max(0, settingsRows[0]?.cumulative_practice_count ?? 0),
      projectPracticeCounts: settingsRows[0]?.project_practice_counts_json
        ? JSON.parse(settingsRows[0].project_practice_counts_json) : {},
      projectOrder: settingsRows[0]?.project_order_json ? JSON.parse(settingsRows[0].project_order_json) : [],
    }
    const sourceRows = (await db.query('SELECT * FROM source_files ORDER BY imported_at DESC')).values ?? []
    snapshot.sources = sourceRows.map((row) => ({
      id: row.id, name: row.name, sha256: row.sha256, importedAt: row.imported_at,
      sheets: JSON.parse(row.sheets_json), questionCount: row.question_count, caseCount: row.case_count,
    }))
    const optionRows = (await db.query('SELECT * FROM question_options ORDER BY option_key')).values ?? []
    const optionsByQuestion = new Map<string, { key: string; text: string }[]>()
    optionRows.forEach((row) => {
      const options = optionsByQuestion.get(row.question_id) ?? []
      options.push({ key: row.option_key, text: row.option_text })
      optionsByQuestion.set(row.question_id, options)
    })
    const questionRows = (await db.query('SELECT * FROM questions ORDER BY sort_order')).values ?? []
    snapshot.questions = questionRows.map((row) => ({
      id: row.id, sourceFileId: row.source_file_id, sheetName: row.sheet_name,
      sourceRow: row.source_row, parentId: row.parent_id ?? null, nodeType: row.node_type,
      answerMode: row.answer_mode, stem: row.stem, normalizedAnswer: row.normalized_answer,
      acceptedAnswers: row.accepted_answers_json ? JSON.parse(row.accepted_answers_json) : [],
      enabled: row.enabled === undefined ? true : Boolean(row.enabled),
      explanation: row.explanation, sortOrder: row.sort_order, fingerprint: row.fingerprint,
      options: optionsByQuestion.get(row.id) ?? [],
    }))
    const projectRows = (await db.query('SELECT * FROM projects ORDER BY updated_at DESC')).values ?? []
    const projectSourceRows = (await db.query('SELECT * FROM project_sources ORDER BY source_order')).values ?? []
    snapshot.projects = projectRows.map((row) => ({
      id: row.id, name: row.name, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at,
      sourceIds: projectSourceRows.filter((link) => link.project_id === row.id).map((link) => link.source_id),
    }))
    const stateRows = (await db.query('SELECT * FROM learning_states')).values ?? []
    snapshot.learningStates = stateRows.map((row) => this.mapLearning(row))
    const sessionRows = (await db.query('SELECT * FROM practice_sessions ORDER BY started_at DESC')).values ?? []
    snapshot.sessions = sessionRows.map((row) => this.mapSession(row))
    const progressRows = (await db.query('SELECT * FROM mode_progress')).values ?? []
    snapshot.modeProgress = progressRows.map((row) => ({
      projectId: row.project_id, orderedCursor: row.ordered_cursor,
      randomQueue: JSON.parse(row.random_queue_json), randomCursor: row.random_cursor,
      randomSignature: row.random_signature,
    }))
    return snapshot
  }

  async importSource(source: SourceFile, questions: Question[]): Promise<void> {
    const db = this.requireDb()
    await db.beginTransaction()
    try {
      await db.run('INSERT INTO source_files VALUES (?, ?, ?, ?, ?, ?, ?)', [
        source.id, source.name, source.sha256, source.importedAt, JSON.stringify(source.sheets), source.questionCount, source.caseCount,
      ], false)
      for (const question of questions) {
        await db.run(`INSERT INTO questions (
          id, source_file_id, sheet_name, source_row, parent_id, node_type, answer_mode,
          stem, normalized_answer, accepted_answers_json, explanation, sort_order, fingerprint
          , enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          question.id, question.sourceFileId, question.sheetName, question.sourceRow, question.parentId,
          question.nodeType, question.answerMode, question.stem, question.normalizedAnswer,
          JSON.stringify(question.acceptedAnswers), question.explanation, question.sortOrder, question.fingerprint,
          question.enabled === false ? 0 : 1,
        ], false)
        for (const option of question.options) {
          await db.run('INSERT INTO question_options VALUES (?, ?, ?)', [question.id, option.key, option.text], false)
        }
      }
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async updateSourceSelection(source: SourceFile, questions: Question[], _enabledTypes: ImportQuestionType[]): Promise<void> {
    const db = this.requireDb()
    await db.beginTransaction()
    try {
      await db.run(`UPDATE source_files SET name = ?, sha256 = ?, imported_at = ?, sheets_json = ?, question_count = ?, case_count = ? WHERE id = ?`, [
        source.name, source.sha256, source.importedAt, JSON.stringify(source.sheets), source.questionCount, source.caseCount, source.id,
      ], false)
      for (const question of questions) {
        await db.run('UPDATE questions SET enabled = ? WHERE id = ?', [question.enabled === false ? 0 : 1, question.id], false)
      }
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async deleteSource(sourceId: string): Promise<void> {
    await this.requireDb().run('DELETE FROM source_files WHERE id = ?', [sourceId])
  }

  async saveProject(project: QuizProject): Promise<void> {
    const db = this.requireDb()
    await db.beginTransaction()
    try {
      await db.run(`INSERT INTO projects VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, updated_at=excluded.updated_at`,
      [project.id, project.name, project.description, project.createdAt, project.updatedAt], false)
      await db.run('DELETE FROM project_sources WHERE project_id = ?', [project.id], false)
      for (const [index, sourceId] of project.sourceIds.entries()) {
        await db.run('INSERT INTO project_sources VALUES (?, ?, ?)', [project.id, sourceId, index], false)
      }
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = this.requireDb()
    await db.beginTransaction()
    try {
      await db.run('DELETE FROM practice_sessions WHERE project_id = ?', [projectId], false)
      await db.run('DELETE FROM projects WHERE id = ?', [projectId], false)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async saveLearningState(state: LearningState): Promise<void> {
    await this.requireDb().run(`INSERT INTO learning_states (
      question_id, attempt_count, correct_count, wrong_count, unanswered_count,
      is_wrong_active, is_favorite, last_answer, last_result, last_answered_at,
      total_duration_ms, note_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET attempt_count=excluded.attempt_count, correct_count=excluded.correct_count,
      wrong_count=excluded.wrong_count, unanswered_count=excluded.unanswered_count,
      is_wrong_active=excluded.is_wrong_active, is_favorite=excluded.is_favorite,
      last_answer=excluded.last_answer, last_result=excluded.last_result,
      last_answered_at=excluded.last_answered_at, total_duration_ms=excluded.total_duration_ms,
      note_text=excluded.note_text`, [
      state.questionId, state.attemptCount, state.correctCount, state.wrongCount, state.unansweredCount,
      Number(state.isWrongActive), Number(state.isFavorite), state.lastAnswer, state.lastResult,
      state.lastAnsweredAt, state.totalDurationMs, state.note,
    ])
  }

  async saveLearningStates(states: LearningState[]): Promise<void> {
    if (!states.length) return
    const statement = `INSERT INTO learning_states (
      question_id, attempt_count, correct_count, wrong_count, unanswered_count,
      is_wrong_active, is_favorite, last_answer, last_result, last_answered_at,
      total_duration_ms, note_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET attempt_count=excluded.attempt_count, correct_count=excluded.correct_count,
      wrong_count=excluded.wrong_count, unanswered_count=excluded.unanswered_count,
      is_wrong_active=excluded.is_wrong_active, is_favorite=excluded.is_favorite,
      last_answer=excluded.last_answer, last_result=excluded.last_result,
      last_answered_at=excluded.last_answered_at, total_duration_ms=excluded.total_duration_ms,
      note_text=excluded.note_text`
    await this.requireDb().executeSet(states.map((state) => ({
      statement,
      values: [
        state.questionId, state.attemptCount, state.correctCount, state.wrongCount, state.unansweredCount,
        Number(state.isWrongActive), Number(state.isFavorite), state.lastAnswer, state.lastResult,
        state.lastAnsweredAt, state.totalDurationMs, state.note,
      ],
    })), true)
  }

  async applyAnswerCorrection(question: Question, state: LearningState, sessions: PracticeSession[]): Promise<void> {
    const db = this.requireDb()
    await db.beginTransaction()
    try {
      await db.run('UPDATE questions SET normalized_answer = ?, accepted_answers_json = ? WHERE id = ?', [
        question.normalizedAnswer, JSON.stringify(question.acceptedAnswers), question.id,
      ], false)
      await db.run(`INSERT INTO learning_states (
        question_id, attempt_count, correct_count, wrong_count, unanswered_count,
        is_wrong_active, is_favorite, last_answer, last_result, last_answered_at,
        total_duration_ms, note_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(question_id) DO UPDATE SET attempt_count=excluded.attempt_count, correct_count=excluded.correct_count,
        wrong_count=excluded.wrong_count, unanswered_count=excluded.unanswered_count,
        is_wrong_active=excluded.is_wrong_active, is_favorite=excluded.is_favorite,
        last_answer=excluded.last_answer, last_result=excluded.last_result,
        last_answered_at=excluded.last_answered_at, total_duration_ms=excluded.total_duration_ms,
        note_text=excluded.note_text`, [
        state.questionId, state.attemptCount, state.correctCount, state.wrongCount, state.unansweredCount,
        Number(state.isWrongActive), Number(state.isFavorite), state.lastAnswer, state.lastResult,
        state.lastAnsweredAt, state.totalDurationMs, state.note,
      ], false)
      for (const session of sessions) {
        await db.run(`UPDATE practice_sessions
          SET correct_count = ?, wrong_count = ?, unanswered_count = ?
          WHERE id = ?`, [session.correctCount, session.wrongCount, session.unansweredCount, session.id], false)
      }
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  async saveSession(session: PracticeSession): Promise<void> {
    await this.requireDb().run(`INSERT INTO practice_sessions (
      id, project_id, mode, entry_kind, status, started_at, completed_at, deadline, unit_ids_json,
      current_index, answers_json, graded_ids_json, correct_count, wrong_count,
      unanswered_count, config_json, duration_ms, question_durations_json, randomize_options
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, started_at=excluded.started_at, completed_at=excluded.completed_at,
      entry_kind=excluded.entry_kind,
      deadline=excluded.deadline, unit_ids_json=excluded.unit_ids_json, current_index=excluded.current_index,
      answers_json=excluded.answers_json, graded_ids_json=excluded.graded_ids_json,
      correct_count=excluded.correct_count, wrong_count=excluded.wrong_count,
      unanswered_count=excluded.unanswered_count, config_json=excluded.config_json,
      duration_ms=excluded.duration_ms, question_durations_json=excluded.question_durations_json,
      randomize_options=excluded.randomize_options`, [
      session.id, session.projectId, session.mode, session.entryKind, session.status, session.startedAt, session.completedAt,
      session.deadline, JSON.stringify(session.unitIds), session.currentIndex, JSON.stringify(session.answers),
      JSON.stringify(session.gradedQuestionIds), session.correctCount, session.wrongCount,
      session.unansweredCount, session.config ? JSON.stringify(session.config) : null,
      session.durationMs, JSON.stringify(session.questionDurationMs),
      Number(session.randomizeOptions === true),
    ])
  }

  async deleteSessions(sessionIds: string[]): Promise<void> {
    if (!sessionIds.length) return
    const placeholders = sessionIds.map(() => '?').join(', ')
    await this.requireDb().run(`DELETE FROM practice_sessions WHERE id IN (${placeholders})`, sessionIds)
  }

  async saveModeProgress(progress: ModeProgress): Promise<void> {
    await this.requireDb().run(`INSERT INTO mode_progress VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET ordered_cursor=excluded.ordered_cursor,
      random_queue_json=excluded.random_queue_json, random_cursor=excluded.random_cursor,
      random_signature=excluded.random_signature`, [
      progress.projectId, progress.orderedCursor, JSON.stringify(progress.randomQueue), progress.randomCursor, progress.randomSignature,
    ])
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.requireDb().run(`INSERT INTO app_settings (
      id, split_case_questions, random_keep_option_order, theme_mode, cumulative_practice_duration_ms, cumulative_practice_count, project_practice_counts_json, project_order_json
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET split_case_questions=excluded.split_case_questions,
      random_keep_option_order=excluded.random_keep_option_order,
      theme_mode=excluded.theme_mode,
      cumulative_practice_duration_ms=excluded.cumulative_practice_duration_ms,
      cumulative_practice_count=excluded.cumulative_practice_count,
      project_practice_counts_json=excluded.project_practice_counts_json,
      project_order_json=excluded.project_order_json`, [
      Number(settings.splitCaseQuestions), Number(settings.randomKeepOptionOrder !== false), settings.themeMode ?? 'SYSTEM', Math.max(0, settings.totalPracticeDurationMs),
      Math.max(0, Math.floor(settings.totalPracticeCount)), JSON.stringify(settings.projectPracticeCounts ?? {}), JSON.stringify(settings.projectOrder),
    ])
  }

  async replaceSnapshot(snapshot: AppSnapshot): Promise<void> {
    if (snapshot.schemaVersion !== 1) throw new Error('备份版本不受支持')
    const normalized = normalizeSnapshot(snapshot)
    const db = this.requireDb()
    await db.beginTransaction()
    try {
      // Execute each delete separately: some Android SQLite versions do not
      // reliably run every statement in a multi-statement execute call.
      await db.run('DELETE FROM practice_sessions', [], false)
      await db.run('DELETE FROM mode_progress', [], false)
      await db.run('DELETE FROM learning_states', [], false)
      await db.run('DELETE FROM project_sources', [], false)
      await db.run('DELETE FROM projects', [], false)
      await db.run('DELETE FROM question_options', [], false)
      await db.run('DELETE FROM questions', [], false)
      await db.run('DELETE FROM source_files', [], false)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
    for (const source of normalized.sources) {
      await this.importSource(source, normalized.questions.filter((question) => question.sourceFileId === source.id))
    }
    for (const project of normalized.projects) await this.saveProject(project)
    for (const state of normalized.learningStates) await this.saveLearningState(state)
    for (const session of normalized.sessions) await this.saveSession(session)
    for (const progress of normalized.modeProgress) await this.saveModeProgress(progress)
    await this.saveSettings(normalized.settings)
  }

  private requireDb(): SQLiteDBConnection {
    if (!this.db) throw new Error('数据库尚未初始化')
    return this.db
  }

  private async ensureLearningNoteColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(learning_states)')).values ?? []
    if (!columns.some((column) => column.name === 'note_text')) {
      await db.execute("ALTER TABLE learning_states ADD COLUMN note_text TEXT NOT NULL DEFAULT '';")
    }
  }

  private async ensureQuestionEnabledColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(questions)')).values ?? []
    if (!columns.some((column) => column.name === 'enabled')) {
      await db.execute('ALTER TABLE questions ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;')
    }
  }

  private async ensureQuestionAcceptedAnswersColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(questions)')).values ?? []
    if (!columns.some((column) => column.name === 'accepted_answers_json')) {
      await db.execute("ALTER TABLE questions ADD COLUMN accepted_answers_json TEXT NOT NULL DEFAULT '[]';")
    }
  }

  private async ensureSessionTimingColumns(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(practice_sessions)')).values ?? []
    if (!columns.some((column) => column.name === 'duration_ms')) {
      await db.execute('ALTER TABLE practice_sessions ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0;')
    }
    if (!columns.some((column) => column.name === 'question_durations_json')) {
      await db.execute("ALTER TABLE practice_sessions ADD COLUMN question_durations_json TEXT NOT NULL DEFAULT '{}';")
    }
  }

  private async ensureSessionEntryKindColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(practice_sessions)')).values ?? []
    if (!columns.some((column) => column.name === 'entry_kind')) {
      await db.execute("ALTER TABLE practice_sessions ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'STANDARD';")
    }
  }

  private async ensureSessionRandomizeOptionsColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(practice_sessions)')).values ?? []
    if (!columns.some((column) => column.name === 'randomize_options')) {
      await db.execute('ALTER TABLE practice_sessions ADD COLUMN randomize_options INTEGER NOT NULL DEFAULT 0;')
    }
  }

  private async ensureRandomKeepOptionOrderColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(app_settings)')).values ?? []
    if (!columns.some((column) => column.name === 'random_keep_option_order')) {
      await db.execute('ALTER TABLE app_settings ADD COLUMN random_keep_option_order INTEGER NOT NULL DEFAULT 1;')
    }
  }

  private async ensureThemeModeColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(app_settings)')).values ?? []
    if (!columns.some((column) => column.name === 'theme_mode')) {
      await db.execute("ALTER TABLE app_settings ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'SYSTEM';")
    }
  }

  private async ensureCumulativePracticeDurationColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(app_settings)')).values ?? []
    if (columns.some((column) => column.name === 'cumulative_practice_duration_ms')) return
    await db.execute('ALTER TABLE app_settings ADD COLUMN cumulative_practice_duration_ms INTEGER NOT NULL DEFAULT 0;')
    await db.execute(`UPDATE app_settings
      SET cumulative_practice_duration_ms = COALESCE((
        SELECT SUM(duration_ms) FROM practice_sessions WHERE status = 'COMPLETED'
      ), 0)
      WHERE id = 1;`)
  }

  private async ensureCumulativePracticeCountColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(app_settings)')).values ?? []
    if (columns.some((column) => column.name === 'cumulative_practice_count')) return
    await db.execute('ALTER TABLE app_settings ADD COLUMN cumulative_practice_count INTEGER NOT NULL DEFAULT 0;')
    await db.execute(`UPDATE app_settings
      SET cumulative_practice_count = (
        SELECT COUNT(*) FROM practice_sessions WHERE status = 'COMPLETED'
      )
      WHERE id = 1;`)
  }

  private async ensureProjectPracticeCountsColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(app_settings)')).values ?? []
    if (columns.some((column) => column.name === 'project_practice_counts_json')) return
    await db.execute("ALTER TABLE app_settings ADD COLUMN project_practice_counts_json TEXT NOT NULL DEFAULT '{}';")
    const rows = (await db.query(`SELECT project_id, COUNT(*) AS practice_count
      FROM practice_sessions WHERE status = 'COMPLETED' AND project_id IS NOT NULL GROUP BY project_id`)).values ?? []
    const counts = Object.fromEntries(rows.map((row) => [row.project_id, Math.max(0, row.practice_count ?? 0)]))
    await db.run('UPDATE app_settings SET project_practice_counts_json = ? WHERE id = 1', [JSON.stringify(counts)])
  }

  private async ensureProjectOrderColumn(): Promise<void> {
    const db = this.requireDb()
    const columns = (await db.query('PRAGMA table_info(app_settings)')).values ?? []
    if (!columns.some((column) => column.name === 'project_order_json')) {
      await db.execute("ALTER TABLE app_settings ADD COLUMN project_order_json TEXT NOT NULL DEFAULT '[]';")
    }
  }

  private mapLearning(row: Record<string, any>): LearningState {
    return {
      questionId: row.question_id, attemptCount: row.attempt_count, correctCount: row.correct_count,
      wrongCount: row.wrong_count, unansweredCount: row.unanswered_count,
      isWrongActive: Boolean(row.is_wrong_active), isFavorite: Boolean(row.is_favorite),
      note: row.note_text ?? '',
      lastAnswer: row.last_answer, lastResult: row.last_result ?? null,
      lastAnsweredAt: row.last_answered_at ?? null, totalDurationMs: row.total_duration_ms,
    }
  }

  private mapSession(row: Record<string, any>): PracticeSession {
    return {
      id: row.id, projectId: row.project_id ?? null, mode: row.mode,
      entryKind: row.entry_kind === 'SINGLE_QUESTION' ? 'SINGLE_QUESTION' : 'STANDARD', status: row.status,
      startedAt: row.started_at, completedAt: row.completed_at ?? null, deadline: row.deadline ?? null,
      unitIds: JSON.parse(row.unit_ids_json), currentIndex: row.current_index,
      answers: JSON.parse(row.answers_json), gradedQuestionIds: JSON.parse(row.graded_ids_json),
      correctCount: row.correct_count, wrongCount: row.wrong_count, unansweredCount: row.unanswered_count,
      durationMs: row.duration_ms ?? 0,
      questionDurationMs: row.question_durations_json ? JSON.parse(row.question_durations_json) : {},
      randomizeOptions: Boolean(row.randomize_options),
      config: row.config_json ? JSON.parse(row.config_json) : null,
    }
  }
}
