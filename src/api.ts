const API_BASE = import.meta.env.VITE_API_URL || 'http://47.102.37.46/api'

// Token management
const TOKEN_KEY = 'fragment-notes-token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

function getAuthHeaders(): HeadersInit {
  const token = getToken()
  return token ? { 'Authorization': `Bearer ${token}` } : {}
}

// Auth APIs
export interface User {
  id: string
  username: string
  email?: string
  createdAt: number
}

export async function register(username: string, password: string, email?: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '注册失败')
  setToken(data.token)
  return data
}

export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '登录失败')
  setToken(data.token)
  return data
}

export async function logout(): Promise<void> {
  removeToken()
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getToken()
  if (!token) return null

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { ...getAuthHeaders() }
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.user
}

// Library APIs
export async function fetchLibraries(): Promise<Library[]> {
  const res = await fetch(`${API_BASE}/libraries`, {
    headers: { ...getAuthHeaders() }
  })
  return res.json()
}

export async function createLibrary(name: string): Promise<Library> {
  const res = await fetch(`${API_BASE}/libraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ name })
  })
  return res.json()
}

export async function updateLibrary(id: string, name: string): Promise<Library> {
  const res = await fetch(`${API_BASE}/libraries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ name })
  })
  return res.json()
}

export async function deleteLibrary(id: string): Promise<void> {
  await fetch(`${API_BASE}/libraries/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  })
}

// Note APIs
export async function fetchNotes(libraryId: string): Promise<Note[]> {
  const res = await fetch(`${API_BASE}/libraries/${libraryId}/notes`, {
    headers: { ...getAuthHeaders() }
  })
  return res.json()
}

export async function createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(note)
  })
  return res.json()
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<void> {
  await fetch(`${API_BASE}/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates)
  })
}

export async function deleteNote(id: string): Promise<void> {
  await fetch(`${API_BASE}/notes/${id}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() }
  })
}
