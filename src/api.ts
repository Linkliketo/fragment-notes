const API_BASE = import.meta.env.VITE_API_URL || 'http://47.102.37.46/api'

// Library APIs
export async function fetchLibraries(): Promise<Library[]> {
  const res = await fetch(`${API_BASE}/libraries`)
  return res.json()
}

export async function createLibrary(name: string): Promise<Library> {
  const res = await fetch(`${API_BASE}/libraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  return res.json()
}

export async function updateLibrary(id: string, name: string): Promise<Library> {
  const res = await fetch(`${API_BASE}/libraries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  return res.json()
}

export async function deleteLibrary(id: string): Promise<void> {
  await fetch(`${API_BASE}/libraries/${id}`, { method: 'DELETE' })
}

// Note APIs
export async function fetchNotes(libraryId: string): Promise<Note[]> {
  const res = await fetch(`${API_BASE}/libraries/${libraryId}/notes`)
  return res.json()
}

export async function createNote(note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  const res = await fetch(`${API_BASE}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(note)
  })
  return res.json()
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<void> {
  await fetch(`${API_BASE}/notes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
}

export async function deleteNote(id: string): Promise<void> {
  await fetch(`${API_BASE}/notes/${id}`, { method: 'DELETE' })
}
