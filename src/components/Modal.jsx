export default function Modal({ title, onClose, children, actions }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>{title}</h3>
        <div className="form-grid" style={{ gap: '.65rem' }}>
          {children}
        </div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}
