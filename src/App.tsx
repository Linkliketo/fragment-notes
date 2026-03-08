import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

// Types
interface Library {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

interface Note {
  id: string
  libraryId: string
  title: string
  content: string
  order: number
  positionX: number
  positionY: number
  rotation: number
  zIndex: number
  sizeMultiplier: number
  createdAt: number
  updatedAt: number
}

type SortMode = 'chaos' | 'axis'

// Generate UUID
const generateId = () => crypto.randomUUID()

// Storage keys
const LIBRARIES_KEY = 'fragment-notes-libraries'
const NOTES_KEY = 'fragment-notes-notes'

// App Component
export default function App() {
  // State
  const [libraries, setLibraries] = useState<Library[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [currentLibraryId, setCurrentLibraryId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>('chaos')
  const [editingNote, setEditingNote] = useState<Note | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false)
  const [newLibraryName, setNewLibraryName] = useState('')
  const [isCreatingLibrary, setIsCreatingLibrary] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string | null }>({ x: 0, y: 0, noteId: null })

  // Preview state (clicked card)
  const [previewingNoteId, setPreviewingNoteId] = useState<string | null>(null)

  // Dragging state
  const [draggedNote, setDraggedNote] = useState<Note | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 })
  const [nextZIndex, setNextZIndex] = useState(1)
  const canvasRef = useRef<HTMLDivElement>(null)

  // Canvas pan and zoom state
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 })
  const [canvasScale, setCanvasScale] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panStartPos, setPanStartPos] = useState({ x: 0, y: 0 })
  const [spacePressed, setSpacePressed] = useState(false)

  // Load data from localStorage
  useEffect(() => {
    const storedLibraries = localStorage.getItem(LIBRARIES_KEY)
    const storedNotes = localStorage.getItem(NOTES_KEY)

    if (storedLibraries) {
      setLibraries(JSON.parse(storedLibraries))
    }

    if (storedNotes) {
      setNotes(JSON.parse(storedNotes))
    }
  }, [])

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem(LIBRARIES_KEY, JSON.stringify(libraries))
  }, [libraries])

  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
  }, [notes])

  // Get current library
  const currentLibrary = libraries.find(l => l.id === currentLibraryId)

  // Get notes for current library
  const currentNotes = notes
    .filter(n => n.libraryId === currentLibraryId)
    .sort((a, b) => a.order - b.order)

  // Create library
  const handleCreateLibrary = useCallback(() => {
    if (!newLibraryName.trim()) return

    const newLibrary: Library = {
      id: generateId(),
      name: newLibraryName.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    setLibraries(prev => [...prev, newLibrary])
    setCurrentLibraryId(newLibrary.id)
    setNewLibraryName('')
    setIsCreatingLibrary(false)
    setIsLibraryMenuOpen(false)
  }, [newLibraryName])

  // Delete library
  const handleDeleteLibrary = useCallback((id: string) => {
    if (!confirm('确定要删除这个库吗？库中的所有笔记将被删除。')) return

    setLibraries(prev => prev.filter(l => l.id !== id))
    setNotes(prev => prev.filter(n => n.libraryId !== id))

    if (currentLibraryId === id) {
      setCurrentLibraryId(null)
    }
  }, [currentLibraryId])

  // Create note
  const handleCreateNote = useCallback(() => {
    if (!currentLibraryId) return

    // Calculate center of current view
    let centerX = 200
    let centerY = 200

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      // Convert viewport center to canvas coordinates
      // The canvas is transformed with translate and scale
      // center in viewport = rect.width / 2, rect.height / 2
      // Convert to canvas space: (viewportPos - canvasOffset) / scale
      centerX = (rect.width / 2 - canvasOffset.x) / canvasScale - 140 // 140 is half of card width
      centerY = (rect.height / 2 - canvasOffset.y) / canvasScale - 90 // 90 is half of card height
    }

    const newNote: Note = {
      id: generateId(),
      libraryId: currentLibraryId,
      title: '无标题',
      content: '',
      order: currentNotes.length,
      positionX: centerX,
      positionY: centerY,
      rotation: 0,
      zIndex: nextZIndex,
      sizeMultiplier: 1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    setNextZIndex(prev => prev + 1)

    setNotes(prev => [...prev, newNote])
    setEditingNote(newNote)
    setIsEditorOpen(true)
  }, [currentLibraryId, currentNotes.length, canvasOffset, canvasScale])

  // Update note
  const handleUpdateNote = useCallback((updatedNote: Note) => {
    setNotes(prev => prev.map(n =>
      n.id === updatedNote.id
        ? { ...updatedNote, updatedAt: Date.now() }
        : n
    ))
  }, [])

  // Delete note
  const handleDeleteNote = useCallback((id: string) => {
    if (!confirm('确定要删除这篇笔记吗？')) return

    setNotes(prev => prev.filter(n => n.id !== id))
    setIsEditorOpen(false)
    setEditingNote(null)
  }, [])

  // Mouse drag handlers for chaos mode
  const [mouseDownTime, setMouseDownTime] = useState<number>(0)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent, note: Note) => {
    if (sortMode !== 'chaos') return

    const rect = (e.target as HTMLElement).closest('.note-card')?.getBoundingClientRect()
    if (!rect) return

    // Record press time to distinguish click vs drag
    const now = Date.now()
    setMouseDownTime(now)

    // Clear preview when pressing on card
    setPreviewingNoteId(null)

    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setDragStartPos({ x: e.clientX, y: e.clientY })
    setDraggedNote(note)
    setIsDragging(false)
  }, [sortMode])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggedNote || sortMode !== 'chaos' || !canvasRef.current) return

    // Check if long press (>200ms) to start dragging
    const pressDuration = Date.now() - mouseDownTime
    if (pressDuration >= 200 && !isDragging) {
      setIsDragging(true)
    }

    // Only move card if dragging (not just pressing)
    if (!isDragging) return

    // Calculate position on canvas considering scale and offset
    // The canvas is transformed with translate and scale
    // need to convert mouse position We to canvas coordinate
    const canvasRect = canvasRef.current.getBoundingClientRect()

    // Convert mouse position to canvas space coordinates
    // canvasOffset is the translation, canvasScale is the zoom level
    const newX = (e.clientX - canvasRect.left - canvasOffset.x) / canvasScale - dragOffset.x / canvasScale
    const newY = (e.clientY - canvasRect.top - canvasOffset.y) / canvasScale - dragOffset.y / canvasScale

    // Bring dragged card to front
    setNextZIndex(prev => {
      const newZ = prev
      setNotes(notes => notes.map(n =>
        n.id === draggedNote.id
          ? { ...n, positionX: newX, positionY: newY, zIndex: newZ, updatedAt: Date.now() }
          : n
      ))
      return prev + 1
    })
  }, [draggedNote, sortMode, dragOffset, dragStartPos, canvasOffset, canvasScale, mouseDownTime, isDragging])

  const handleMouseUp = useCallback(() => {
    setDraggedNote(null)
    setIsPanning(false)
    setIsDragging(false)
  }, [])

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu({ x: 0, y: 0, noteId: null })
  }, [])

  const handleSizeChange = useCallback((multiplier: number) => {
    if (!contextMenu.noteId) return
    setNotes(prev => prev.map(n =>
      n.id === contextMenu.noteId
        ? { ...n, sizeMultiplier: multiplier, updatedAt: Date.now() }
        : n
    ))
    handleCloseContextMenu()
  }, [contextMenu.noteId, handleCloseContextMenu])

  // Canvas pan handlers (space + left click or middle mouse button)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Start panning with space + left click OR middle mouse button
    if ((spacePressed && e.button === 0) || e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      setPanStartPos({ x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y })
    }
  }, [canvasOffset, spacePressed])

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setCanvasOffset({
        x: e.clientX - panStartPos.x,
        y: e.clientY - panStartPos.y
      })
    }
  }, [isPanning, panStartPos])

  // Keyboard handler for arrow keys and space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const step = 50
      if (e.key === 'ArrowUp') {
        setCanvasOffset(prev => ({ ...prev, y: prev.y + step }))
      } else if (e.key === 'ArrowDown') {
        setCanvasOffset(prev => ({ ...prev, y: prev.y - step }))
      } else if (e.key === 'ArrowLeft') {
        setCanvasOffset(prev => ({ ...prev, x: prev.x + step }))
      } else if (e.key === 'ArrowRight') {
        setCanvasOffset(prev => ({ ...prev, x: prev.x - step }))
      } else if (e.key === ' ') {
        e.preventDefault()
        setSpacePressed(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setSpacePressed(false)
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Canvas zoom handlers (mouse wheel)
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(canvasScale * delta, 0.25), 2)

    // Zoom towards mouse position
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) {
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const newOffsetX = mouseX - (mouseX - canvasOffset.x) * (newScale / canvasScale)
      const newOffsetY = mouseY - (mouseY - canvasOffset.y) * (newScale / canvasScale)

      setCanvasScale(newScale)
      setCanvasOffset({ x: newOffsetX, y: newOffsetY })
    }
  }, [canvasScale, canvasOffset])

  // Handle reordering in axis mode
  const handleAxisDragStart = useCallback((e: React.DragEvent, note: Note) => {
    e.dataTransfer.setData('text/plain', note.id)
  }, [])

  const handleAxisDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleAxisDrop = useCallback((e: React.DragEvent, targetNote: Note) => {
    e.preventDefault()
    const draggedId = e.dataTransfer.getData('text/plain')

    if (!draggedId || draggedId === targetNote.id) return

    const draggedNoteItem = notes.find(n => n.id === draggedId)
    if (!draggedNoteItem) return

    const currentLibraryNotes = currentNotes
    const draggedIndex = currentLibraryNotes.findIndex(n => n.id === draggedId)
    const targetIndex = currentLibraryNotes.findIndex(n => n.id === targetNote.id)

    if (draggedIndex === -1 || targetIndex === -1) return

    const newNotes = [...currentLibraryNotes]
    newNotes.splice(draggedIndex, 1)
    newNotes.splice(targetIndex, 0, draggedNoteItem)

    // Update order for all notes
    setNotes(prev => prev.map(n => {
      const newOrder = newNotes.findIndex(nn => nn.id === n.id)
      if (newOrder !== -1 && n.libraryId === currentLibraryId) {
        return { ...n, order: newOrder }
      }
      return n
    }))
  }, [notes, currentLibraryId, currentNotes])

  // Render content preview
  const renderContentPreview = (content: string) => {
    if (content.length < 500) {
      return content
    }
    return content.substring(0, 200) + '...'
  }

  // Calculate card dimensions - consistent 50%-200% scaling
  const getCardSize = (content: string, sizeMultiplier: number = 1) => {
    const baseWidth = 280   // 100% width
    const baseHeight = 180  // 100% height

    // Clamp multiplier between 50% and 200%
    const multiplier = Math.min(2, Math.max(0.5, sizeMultiplier))

    return {
      width: baseWidth * multiplier,
      height: baseHeight * multiplier
    }
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="logo">碎片笔记</h1>

          <div className="library-selector">
            <button
              className="library-button"
              onClick={() => setIsLibraryMenuOpen(!isLibraryMenuOpen)}
            >
              {currentLibrary?.name || '选择库'}
              <span className="arrow">▼</span>
            </button>

            {isLibraryMenuOpen && (
              <div className="library-menu">
                {libraries.map(lib => (
                  <div
                    key={lib.id}
                    className={`library-item ${lib.id === currentLibraryId ? 'active' : ''}`}
                    onClick={() => {
                      setCurrentLibraryId(lib.id)
                      setIsLibraryMenuOpen(false)
                    }}
                  >
                    <span>{lib.name}</span>
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteLibrary(lib.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}

                {isCreatingLibrary ? (
                  <div className="library-input-row">
                    <input
                      type="text"
                      value={newLibraryName}
                      onChange={(e) => setNewLibraryName(e.target.value)}
                      placeholder="库名称"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateLibrary()}
                    />
                    <button onClick={handleCreateLibrary}>✓</button>
                    <button onClick={() => setIsCreatingLibrary(false)}>×</button>
                  </div>
                ) : (
                  <button
                    className="new-library-btn"
                    onClick={() => setIsCreatingLibrary(true)}
                  >
                    + 新建库
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="header-right">
          {currentLibraryId && (
            <>
              <div className="zoom-controls">
                <button
                  className="zoom-btn"
                  onClick={() => {
                    setCanvasScale(s => Math.min(Math.max(s * 0.9, 0.25), 2))
                  }}
                >
                  -
                </button>
                <span className="zoom-level">{Math.round(canvasScale * 100)}%</span>
                <button
                  className="zoom-btn"
                  onClick={() => {
                    setCanvasScale(s => Math.min(Math.max(s * 1.1, 0.25), 2))
                  }}
                >
                  +
                </button>
                <button
                  className="zoom-btn reset"
                  onClick={() => {
                    setCanvasScale(1)
                    setCanvasOffset({ x: 0, y: 0 })
                  }}
                >
                  重置
                </button>
              </div>

              <div className="sort-toggle">
                <button
                  className={sortMode === 'chaos' ? 'active' : ''}
                  onClick={() => setSortMode('chaos')}
                >
                  混乱排序
                </button>
                <button
                  className={sortMode === 'axis' ? 'active' : ''}
                  onClick={() => setSortMode('axis')}
                >
                  轴排序
                </button>
              </div>
            </>
          )}

          <button
            className="btn btn-primary"
            onClick={handleCreateNote}
            disabled={!currentLibraryId}
          >
            + 新建笔记
          </button>
        </div>
      </header>

      {/* Main Canvas */}
      <main
        className="canvas"
        ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={(e) => {
          handleMouseMove(e)
          handleCanvasMouseMove(e)
        }}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleCanvasWheel}
        onAuxClick={handleCanvasMouseDown}
        style={{ cursor: isPanning || (spacePressed && !isPanning) ? 'grab' : 'default' }}
      >
        {/* Grid overlay that scales with zoom */}
        <div
          className="canvas-grid"
          style={{
            backgroundSize: `${50 * canvasScale}px ${50 * canvasScale}px`
          }}
        />
        {!currentLibraryId ? (
          <div className="empty-state">
            {libraries.length === 0 ? (
              <>
                <h2>欢迎使用碎片笔记</h2>
                <p>创建一个库来开始整理你的碎片知识</p>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setIsCreatingLibrary(true)
                    setIsLibraryMenuOpen(true)
                  }}
                >
                  创建第一个库
                </button>
              </>
            ) : (
              <>
                <h2>选择一个库</h2>
                <p>从顶部菜单选择或创建一个新库</p>
              </>
            )}
          </div>
        ) : currentNotes.length === 0 ? (
          <div className="empty-state">
            <h2>这个库是空的</h2>
            <p>点击"新建笔记"创建第一篇笔记</p>
          </div>
        ) : sortMode === 'chaos' ? (
          <div
            className="chaos-canvas"
            style={{
              transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
              transformOrigin: '0 0'
            }}
          >
            {currentNotes.map(note => (
              <div
                key={note.id}
                className="note-card"
                style={{
                  left: note.positionX,
                  top: note.positionY,
                  width: getCardSize(note.content, note.sizeMultiplier || 1).width,
                  height: getCardSize(note.content, note.sizeMultiplier || 1).height,
                  zIndex: note.zIndex || 1,
                  ...(note.id === previewingNoteId ? {
                    transform: 'scale(1.02)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease'
                  } : {})
                }}
                onMouseDown={(e) => handleMouseDown(e, note)}
                onClick={() => {
                  // Only preview if press was short (< 200ms) - this is a click, not a drag
                  const pressDuration = Date.now() - mouseDownTime
                  if (pressDuration < 200) {
                    setPreviewingNoteId(note.id)
                  }
                }}
                onDoubleClick={() => {
                  setEditingNote(note)
                  setIsEditorOpen(true)
                }}
                onContextMenu={(e) => handleContextMenu(e, note)}
              >
                <div className="note-title">{note.title}</div>
                <div className="note-content">
                  {renderContentPreview(note.content)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="axis-canvas"
            style={{
              transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
              transformOrigin: '0 0'
            }}
          >
            <div className="axis-line" />
            <div className="axis-notes">
              {currentNotes.map((note) => (
                <div
                  key={note.id}
                  className="note-card axis-card"
                  style={{
                    width: getCardSize(note.content, note.sizeMultiplier || 1).width,
                    height: getCardSize(note.content, note.sizeMultiplier || 1).height,
                    ...(note.id === previewingNoteId ? {
                      transform: 'scale(1.02)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease'
                    } : {})
                  }}
                  draggable
                  onDragStart={(e) => handleAxisDragStart(e, note)}
                  onDragOver={handleAxisDragOver}
                  onDrop={(e) => handleAxisDrop(e, note)}
                  onClick={() => setPreviewingNoteId(note.id)}
                  onDoubleClick={() => {
                    setEditingNote(note)
                    setIsEditorOpen(true)
                  }}
                  onContextMenu={(e) => handleContextMenu(e, note)}
                >
                  <div className="note-title">{note.title}</div>
                  <div className="note-content">
                    {renderContentPreview(note.content)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Context Menu */}
      {contextMenu.noteId && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              const note = notes.find(n => n.id === contextMenu.noteId)
              if (note) {
                setEditingNote(note)
                setIsEditorOpen(true)
              }
              handleCloseContextMenu()
            }}
          >
            编辑
          </div>
          <div
            className="context-menu-item context-menu-item-danger"
            onClick={() => {
              if (confirm('确定要删除这篇笔记吗？')) {
                handleDeleteNote(contextMenu.noteId!)
              }
              handleCloseContextMenu()
            }}
          >
            删除
          </div>
          <div className="context-menu-separator" />
          <div className="context-menu-submenu">
            <div className="context-menu-item has-submenu">
              调整大小 ▸
            </div>
            <div className="context-menu-submenu-content">
              {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(mult => (
                <div
                  key={mult}
                  className={`context-menu-item ${(notes.find(n => n.id === contextMenu.noteId)?.sizeMultiplier || 1) === mult ? 'active' : ''}`}
                  onClick={() => handleSizeChange(mult)}
                >
                  {mult * 100}%
                </div>
              ))}
              <div className="context-menu-separator" />
              <div
                className="context-menu-item"
                onClick={() => handleSizeChange(1)}
              >
                重置大小
              </div>
            </div>
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              const note = notes.find(n => n.id === contextMenu.noteId)
              if (note) {
                navigator.clipboard.writeText(`${note.title}\n\n${note.content}`)
                alert('已复制到剪贴板')
              }
              handleCloseContextMenu()
            }}
          >
            复制内容
          </div>
          <div
            className="context-menu-item"
            onClick={() => {
              const note = notes.find(n => n.id === contextMenu.noteId)
              if (note) {
                const blob = new Blob([`# ${note.title}\n\n${note.content}`], { type: 'text/markdown' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${note.title || '笔记'}.md`
                a.click()
                URL.revokeObjectURL(url)
              }
              handleCloseContextMenu()
            }}
          >
            导出
          </div>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu.noteId && (
        <div
          className="context-menu-overlay"
          onClick={handleCloseContextMenu}
        />
      )}

      {/* Editor Modal */}
      {isEditorOpen && editingNote && (
        <NoteEditor
          note={editingNote}
          onSave={(updated) => {
            handleUpdateNote(updated)
            setIsEditorOpen(false)
            setEditingNote(null)
          }}
          onDelete={() => handleDeleteNote(editingNote.id)}
          onClose={() => {
            setIsEditorOpen(false)
            setEditingNote(null)
          }}
        />
      )}
    </div>
  )
}

// Note Editor Component
function NoteEditor({
  note,
  onSave,
  onDelete,
  onClose
}: {
  note: Note
  onSave: (note: Note) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [showPreview, setShowPreview] = useState(false)

  const hasChanges = title !== note.title || content !== note.content

  const handleClose = () => {
    if (hasChanges) {
      const shouldSave = window.confirm('您有未保存的更改，是否保存？')
      if (shouldSave) {
        handleSave()
        return
      }
    }
    onClose()
  }

  const handleSave = () => {
    onSave({
      ...note,
      title: title || '无标题',
      content
    })
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content editor-modal" onClick={e => e.stopPropagation()}>
        <div className="editor-header">
          <input
            type="text"
            className="title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="笔记标题"
            autoFocus
          />
          <div className="editor-actions">
            <button
              className={`btn ${showPreview ? 'btn-secondary' : 'btn-primary'}`}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? '编辑' : '预览'}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              保存
            </button>
            <button className="btn btn-danger" onClick={onDelete}>
              删除
            </button>
            <button className="btn btn-secondary" onClick={handleClose}>
              关闭
            </button>
          </div>
        </div>

        <div className="editor-body">
          {showPreview ? (
            <div className="preview-content markdown-body">
              <h3>{title}</h3>
              <pre>{content || '（无内容）'}</pre>
            </div>
          ) : (
            <textarea
              className="content-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="使用 Markdown 编写内容..."
            />
          )}
        </div>

        <div className="editor-hint">
          支持 Markdown 语法：**粗体**、*斜体*、# 标题、```代码块```
        </div>
      </div>
    </div>
  )
}
