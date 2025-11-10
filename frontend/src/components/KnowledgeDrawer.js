import React from 'react';
import './KnowledgeDrawer.css';

const KnowledgeDrawer = ({ open, onClose, children }) => (
  <div className={`drawer ${open ? 'drawer--open' : ''}`}>
    <div className="drawer__backdrop" onClick={onClose} />
    <aside className="drawer__panel" role="dialog" aria-modal="true" aria-hidden={!open}>
      <header className="drawer__header">
        <h2>Knowledge base</h2>
        <button className="drawer__close" type="button" onClick={onClose} aria-label="Close knowledge base">
          Close
        </button>
      </header>
      <div className="drawer__content">{children}</div>
    </aside>
  </div>
);

export default KnowledgeDrawer;
