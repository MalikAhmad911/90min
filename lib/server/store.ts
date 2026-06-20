import { promises as fs } from 'fs'
import path from 'path'
import type { StreamOverrides } from '@/lib/tv/types'

const DATA_DIR = path.join(process.cwd(), 'data')
const STREAMS_FILE = path.join(DATA_DIR, 'streams.json')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

export interface User {
  id: string
  username: string
  passwordHash: string
  role: 'admin'
}

const EMPTY_OVERRIDES: StreamOverrides = { byMatch: {}, byCompetition: {} }

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await ensureDir()
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
}

export async function readStreams(): Promise<StreamOverrides> {
  const data = await readJson<StreamOverrides>(STREAMS_FILE, EMPTY_OVERRIDES)
  // Normalise in case the file is partial.
  return { byMatch: data.byMatch ?? {}, byCompetition: data.byCompetition ?? {} }
}

export async function writeStreams(overrides: StreamOverrides): Promise<void> {
  await writeJson(STREAMS_FILE, overrides)
}

export async function readUsers(): Promise<User[]> {
  return readJson<User[]>(USERS_FILE, [])
}

export async function writeUsers(users: User[]): Promise<void> {
  await writeJson(USERS_FILE, users)
}
