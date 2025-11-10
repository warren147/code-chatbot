import React from 'react';
import './SessionSidebar.css';

const fallbackTitle = (session) => {
  if (session.title && session.title.trim()) {
    return session.title.trim();
  }
  return 'Untitled chat';
};

const SessionSidebar = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onOpenKnowledge,
  onDeleteSession,
  collapsed = false,
  onToggleCollapse,
}) => {
  const handleDelete = (event, sessionId) => {
    event.stopPropagation();
    onDeleteSession?.(sessionId);
  };

  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed-only">
        <button
          className="sidebar__expand"
          type="button"
          aria-label="Expand sidebar"
          onClick={onToggleCollapse}
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path
              fill="currentColor"
              d="M10.5 5a1 1 0 0 0-.7 1.714L13.086 10l-3.285 3.286a1 1 0 0 0 1.414 1.414l4-4a1 1 0 0 0 0-1.414l-4-4A1 1 0 0 0 10.5 5Z"
            />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">Code Chatbot</span>
        <div className="sidebar__brand-actions">
          {/* {onOpenKnowledge && (
            // <button
            //   className="sidebar__kb-button"
            //   type="button"
            //   onClick={onOpenKnowledge}
            // >
            //   Knowledge
            // </button>
          )} */}
          {onToggleCollapse && (
            <button className="sidebar__collapse" type="button" aria-label="Collapse sidebar" onClick={onToggleCollapse}>
              <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M15.5 5a1 1 0 0 1 .7 1.714L12.914 10l3.286 3.286a1 1 0 0 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4A1 1 0 0 1 15.5 5Z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <button className="sidebar__new-chat" type="button" onClick={onCreateSession}>
        + New chat
      </button>

      <div className="sidebar__section">
        <h4 className="sidebar__section-title">History</h4>
        <nav className="sidebar__list" aria-label="Chat history">
          {sessions.length === 0 ? (
            <p className="sidebar__empty">No conversations yet.</p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div className="sidebar__entry" key={session.id}>
                  <button
                    className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
                    type="button"
                    onClick={() => onSelectSession(session.id)}
                  >
                    <span className="sidebar__item-title">{fallbackTitle(session)}</span>
                    <span className="sidebar__item-date">
                      {new Date(session.createdAt || Date.now()).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sidebar__delete"
                    aria-label="Delete conversation"
                    onClick={(event) => handleDelete(event, session.id)}
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M9 3a1 1 0 0 0-1 1v1H5.5a1 1 0 1 0 0 2H6v11a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7h.5a1 1 0 1 0 0-2H16V4a1 1 0 0 0-1-1H9Zm1 2h4V5h-4v1Zm0 6a1 1 0 1 1 2 0v6a1 1 0 1 1-2 0v-6Zm4-1a1 1 0 0 1 2 0v7a1 1 0 0 1-2 0v-7Z"
                      />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </nav>
      </div>
    </aside>
  );
};

export default SessionSidebar;
