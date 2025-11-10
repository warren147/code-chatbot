import React from 'react';
import './Modal.css';

const Modal = ({ isOpen, onClose, onConfirm, title, confirmLabel = 'Confirm', cancelLabel = 'Cancel', children }) => {
  if (!isOpen) return null;

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick} aria-modal="true" role="dialog">
      <div className="modal-content">
        {title && <h3>{title}</h3>}
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button onClick={onConfirm} className="modal-confirm-button">
            {confirmLabel}
          </button>
          <button onClick={onClose} className="modal-cancel-button">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
