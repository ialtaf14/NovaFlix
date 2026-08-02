import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import api from '../services/api'
import PasswordInput from '../components/PasswordInput'
import './Login.css'

export default function Login() {
  const [tab, setTab] = useState('login')
  const navigate = useNavigate()
  const location = useLocation()
  const { setAuth } = useAuthStore()
  const from = location.state?.from?.pathname || '/discover'

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get('token')
    const error = params.get('error')

    if (token) {
      const fetchUserAndLogin = async () => {
        setLoginLoading(true)
        try {
          // Temporarily store auth token so interceptor sends it
          setAuth({ username: 'loading...' }, token)
          const { data } = await api.get('/auth/me')
          setAuth(data, token)
          navigate(from, { replace: true })
        } catch (err) {
          setLoginError('Failed to fetch user profile after social login.')
        } finally {
          setLoginLoading(false)
        }
      }
      fetchUserAndLogin()
    } else if (error) {
      setLoginError(decodeURIComponent(error))
    }
  }, [location.search, navigate, from, setAuth])

  // ── Login state ──────────────────────────────────────────────────────────
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // ── Signup state ─────────────────────────────────────────────────────────
  const [signupForm, setSignupForm] = useState({ username: '', name: '', password: '' })
  const [signupError, setSignupError] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)

  // ── Helpers ──────────────────────────────────────────────────────────────
  const switchTab = (t) => {
    setTab(t)
    setLoginError('')
    setSignupError('')
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginLoading(true); setLoginError('')
    try {
      const { data } = await api.post('/auth/login', loginForm)
      setAuth(data.user, data.token)
      navigate(from, { replace: true })
    } catch (err) {
      setLoginError(err.response?.data?.detail || 'Login failed')
    } finally { setLoginLoading(false) }
  }

  // ── Signup ────────────────────────────────────────────────────────────────
  const handleSignup = async (e) => {
    e.preventDefault()
    setSignupLoading(true); setSignupError('')
    try {
      const { data } = await api.post('/auth/signup', {
        username: signupForm.username,
        name: signupForm.name,
        password: signupForm.password,
      })
      setAuth(data.user, data.token)
      navigate('/discover')
    } catch (err) {
      setSignupError(err.response?.data?.detail || 'Signup failed')
    } finally { setSignupLoading(false) }
  }

  // ── Centralized OAuth Redirects ──────────────────────────────────────────
  const loginWithGoogle = () => {
    const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname)
    window.location.href = `/api/auth/google/login?redirect_to=${redirectTo}`
  }

  const loginWithFacebook = () => {
    const redirectTo = encodeURIComponent(window.location.origin + window.location.pathname)
    window.location.href = `/api/auth/facebook/login?redirect_to=${redirectTo}`
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="login-page">
      <div className="login-box glass fade-up">

        {/* Logo */}
        <div className="login-logo">
          <img src="/logo.jpg" alt="NovaFlix" className="login-logo-img" />
        </div>
        
        <div style={{textAlign: "center", marginBottom: "25px"}}>
          <h2 style={{color: "white", marginBottom: "8px", fontSize: "1.5rem"}}>
            {tab === 'login' ? 'Sign In' : 'Sign Up'}
          </h2>
          <p style={{color: "#aaa", fontSize: "0.9rem"}}>
            {tab === 'login' ? 'Welcome back! Please sign in to continue' : 'Create your account to get started'}
          </p>
        </div>

        {/* ══════════════ SIGN UP ══════════════ */}
        {tab === 'signup' && (
          <div className="login-form">
            <p className="section-title">1. Sign Up Manually</p>
            <form onSubmit={handleSignup} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <div className="input-group">
                <i className="far fa-user input-icon"></i>
                <input className="input" placeholder="Username" value={signupForm.username}
                  maxLength={30} onChange={e => setSignupForm(f => ({ ...f, username: e.target.value }))} required />
              </div>
              <div className="input-group">
                <i className="far fa-id-badge input-icon"></i>
                <input className="input" placeholder="Name" value={signupForm.name}
                  maxLength={30} onChange={e => setSignupForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="input-group">
                <PasswordInput placeholder="Password" value={signupForm.password}
                  onChange={e => setSignupForm(f => ({ ...f, password: e.target.value }))} required />
              </div>
              
              {signupError && <p className="form-error">{signupError}</p>}
              
              <button className="btn btn-primary btn-full" type="submit" disabled={signupLoading}>
                {signupLoading ? 'Signing Up…' : 'Sign Up'}
              </button>
            </form>

            <div className="divider"><span>OR</span></div>

            <button type="button" className="btn btn-google" onClick={() => loginWithGoogle()} disabled={signupLoading}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" />
              Sign Up with Google
            </button>
            <button type="button" className="btn btn-facebook" onClick={() => loginWithFacebook()} disabled={signupLoading}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" alt="F" />
              Sign Up with Facebook
            </button>
            
            <p className="auth-switch">
              Already have an account? <span onClick={() => switchTab('login')}>Sign In</span>
            </p>
          </div>
        )}

        {/* ══════════════ LOGIN ══════════════ */}
        {tab === 'login' && (
          <div className="login-form">
            <p className="section-title">1. Sign In with Username</p>
            <form onSubmit={handleLogin} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
              <div className="input-group">
                <i className="far fa-user input-icon"></i>
                <input className="input" placeholder="Username" value={loginForm.username}
                  onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} required />
              </div>
              <div className="input-group">
                <PasswordInput placeholder="Password" value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} required />
              </div>

              {loginError && <p className="form-error">{loginError}</p>}

              <button className="btn btn-primary btn-full" type="submit" disabled={loginLoading}>
                {loginLoading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="divider"><span>OR</span></div>

            <button type="button" className="btn btn-google" onClick={() => loginWithGoogle()} disabled={loginLoading}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" />
              Sign In with Google
            </button>
            <button type="button" className="btn btn-facebook" onClick={() => loginWithFacebook()} disabled={loginLoading}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/05/Facebook_Logo_%282019%29.png" alt="F" />
              Sign In with Facebook
            </button>

            <p className="auth-switch">
              Don't have an account? <span onClick={() => switchTab('signup')}>Sign Up</span>
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
