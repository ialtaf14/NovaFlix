import React from 'react'
import './AttachmentMenu.css'

export default function AttachmentMenu({ onSelect, onClose }) {
  const options = [
    { id: 'document', icon: 'description', label: 'Document', color: '#8b5cf6' },
    { id: 'camera', icon: 'photo_camera', label: 'Camera', color: '#ef4444' },
    { id: 'gallery', icon: 'image', label: 'Gallery', color: '#10b981' },
    { id: 'audio', icon: 'headset', label: 'Audio', color: '#f59e0b' },
    { id: 'location', icon: 'place', label: 'Location', color: '#3b82f6' },
    { id: 'contact', icon: 'person', label: 'Contact', color: '#ec4899' },
    { id: 'poll', icon: 'poll', label: 'Poll', color: '#06b6d4' }
  ]

  return (
    <>
      <div className="attachment-backdrop" onClick={onClose} />
      <div className="attachment-menu animate-fade-in-up">
        {options.map(opt => (
          <div key={opt.id} className="attachment-item" onClick={() => { onSelect(opt.id); onClose(); }}>
            <div className="attachment-icon-circle" style={{ backgroundColor: opt.color }}>
              <span className="material-icons">{opt.icon}</span>
            </div>
            <span className="attachment-label">{opt.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}
