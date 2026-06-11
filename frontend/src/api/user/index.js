import { api } from '@/plugins/axiosinterceptor.js'

export const signup = async (req) => {
  const res = await api.post('/user/signup', req)

  return res
}

export const login = async (req) => {
  const res = await api.post('/login', req)

  return res
}

export const logout = async () => {
  const res = await api.post('/auth/logout')
  return res
}

export default { signup, login, logout }
