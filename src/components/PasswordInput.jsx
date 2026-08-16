import { useState } from 'react'
import './PasswordInput.css'

export default function PasswordInput({ value, onChange, placeholder, className = '', required = false, ...props }) {
  const [show, setShow] = useState(false)

  return (
    <div className="password-input-wrapper">
      <i className="fas fa-lock input-icon"></i>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`input password-input ${className}`}
        style={{ paddingLeft: '45px' }}
        {...props}
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={() => setShow(!show)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`eye-svg ${show ? 'eye-visible' : 'eye-hidden'}`}
        >
          {/* Eye outline */}
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          
          {/* Pupil */}
          <circle cx="12" cy="12" r="3" className="eye-pupil" />
          
          {/* Slash line */}
          <line x1="3" y1="3" x2="21" y2="21" className="eye-slash" />
        </svg>
      </button>
    </div>
  )
}
