import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import Chat from './components/Chat';
import FileUpload from './components/FileUpload';
import FileList from './components/FileList';
import SessionSidebar from './components/SessionSidebar';
import KnowledgeDrawer from './components/KnowledgeDrawer';
import Modal from './components/Modal';
import client from './api/client';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [refreshFiles, setRefreshFiles] = useState(false);
  const [sessionPendingDelete, setSessionPendingDelete] = useState(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const activeSessionRef = useRef(null);

  useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  const fetchSessions = useCallback(
    async ({ preferredId } = {}) => {
      try {
        const { data } = await client.get('/sessions');
        const list = data.sessions || [];
        setSessions(list);

        const current = preferredId || activeSessionRef.current;
        const fallback = list.length ? list[0].id : null;
        const resolved =
          current && list.some((session) => session.id === current) ? current : fallback;

        setActiveSessionId(resolved);
        activeSessionRef.current = resolved;
      } catch (error) {
        console.error('Failed to load sessions:', error);
      }
    },
    []
  );

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const ensureActiveSession = useCallback(async () => {
    if (activeSessionRef.current) {
      return activeSessionRef.current;
    }
    try {
      const { data } = await client.post('/sessions');
      const newId = data.sessionId;
      activeSessionRef.current = newId;
      setActiveSessionId(newId);
      await fetchSessions({ preferredId: newId });
      return newId;
    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error('Could not start a new conversation.');
    }
  }, [fetchSessions]);

  const handleCreateSession = useCallback(async () => {
    try {
      const { data } = await client.post('/sessions');
      const newId = data.sessionId;
      activeSessionRef.current = newId;
      setActiveSessionId(newId);
      await fetchSessions({ preferredId: newId });
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }, [fetchSessions]);

  const handleSelectSession = useCallback((sessionId) => {
    activeSessionRef.current = sessionId;
    setActiveSessionId(sessionId);
  }, []);

  const handleSessionCleared = useCallback(async () => {
    activeSessionRef.current = null;
    setActiveSessionId(null);
    await fetchSessions();
  }, [fetchSessions]);

  const handleUploadSuccess = () => {
    setRefreshFiles((prev) => !prev);
  };

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const handleRequestDeleteSession = useCallback(
    (sessionId) => {
      const session = sessions.find((item) => item.id === sessionId);
      if (!session) {
        return;
      }
      setSessionPendingDelete(session);
    },
    [sessions]
  );

  const closeDeleteModal = useCallback(() => {
    if (isDeletingSession) {
      return;
    }
    setSessionPendingDelete(null);
  }, [isDeletingSession]);

  const confirmDeleteSession = useCallback(async () => {
    if (!sessionPendingDelete || isDeletingSession) {
      return;
    }
    setIsDeletingSession(true);
    try {
      await client.delete(`/sessions/${sessionPendingDelete.id}`);
      if (activeSessionRef.current === sessionPendingDelete.id) {
        activeSessionRef.current = null;
        setActiveSessionId(null);
      }
      await fetchSessions();
      toast.success('Conversation deleted.');
    } catch (error) {
      console.error('Failed to delete session:', error);
      toast.error('Could not delete this conversation.');
    } finally {
      setIsDeletingSession(false);
      setSessionPendingDelete(null);
    }
  }, [sessionPendingDelete, isDeletingSession, fetchSessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || null,
    [sessions, activeSessionId]
  );

  return (
    <div className={`app-root${isSidebarCollapsed ? ' app-root--sidebar-collapsed' : ''}`}>
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        onOpenKnowledge={() => setIsDrawerOpen(true)}
        onDeleteSession={handleRequestDeleteSession}
        collapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <h1>Workspace</h1>
          </div>
          <button className="topbar__button" type="button" onClick={() => setIsDrawerOpen(true)}>
            Manage knowledge
          </button>
        </header>

        <section className="app-chat">
          <Chat
            sessionId={activeSessionId}
            sessionTitle={activeSession?.title}
            ensureSession={ensureActiveSession}
            onSessionsRefresh={fetchSessions}
            onSessionCleared={handleSessionCleared}
          />
        </section>
      </main>

      <KnowledgeDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <FileUpload onUploadSuccess={handleUploadSuccess} />
        <FileList refresh={refreshFiles} />
      </KnowledgeDrawer>

      <Modal
        isOpen={Boolean(sessionPendingDelete)}
        onClose={closeDeleteModal}
        onConfirm={confirmDeleteSession}
        title="Delete conversation"
        confirmLabel={isDeletingSession ? 'Deleting...' : 'Delete'}
        cancelLabel="Cancel"
      >
        <p>
          {`Are you sure you want to delete "${
            sessionPendingDelete?.title?.trim() || 'Untitled chat'
          }"? This cannot be undone.`}
        </p>
      </Modal>

      <ToastContainer
        position="bottom-right"
        newestOnTop
        closeOnClick
        pauseOnFocusLoss={false}
        pauseOnHover
        draggable={false}
        theme="dark"
      />
    </div>
  );
}

export default App;
