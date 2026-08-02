import { io } from 'socket.io-client'
import { useAuthStore } from '../store/useAuthStore'

let socket = null

const SOCKET_URL = ''

export function getSocket() {
  if (!socket) {
    const username = useAuthStore.getState().user?.username || 'anonymous'
    socket = io(SOCKET_URL, { path: '/ws/socket.io', auth: { username }, transports: ['websocket', 'polling'] })
    socket.on('connect', () => console.log('[Socket.IO] Connected:', socket.id))
    socket.on('disconnect', () => console.log('[Socket.IO] Disconnected'))
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
