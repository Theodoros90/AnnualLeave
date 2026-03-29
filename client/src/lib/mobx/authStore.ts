import { makeAutoObservable, runInAction } from 'mobx'
import { getCurrentUser, login, logout, register } from '../api'
import type { LoginRequest, RegisterRequest, UserInfo } from '../types'

class AuthStore {
    user: UserInfo | null = null
    hasCheckedAuth = false
    isLoadingUser = false

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true })
    }

    get isAuthenticated() {
        return this.user !== null
    }

    async hydrateUser() {
        if (this.hasCheckedAuth || this.isLoadingUser) {
            return
        }

        this.isLoadingUser = true

        try {
            const user = await getCurrentUser()
            runInAction(() => {
                this.user = user
            })
        } catch {
            runInAction(() => {
                this.user = null
            })
        } finally {
            runInAction(() => {
                this.hasCheckedAuth = true
                this.isLoadingUser = false
            })
        }
    }

    async signIn(credentials: LoginRequest) {
        this.isLoadingUser = true

        try {
            await login(credentials)
            const user = await getCurrentUser()

            runInAction(() => {
                this.user = user
                this.hasCheckedAuth = true
            })

            return user
        } finally {
            runInAction(() => {
                this.isLoadingUser = false
            })
        }
    }

    async signUp(details: RegisterRequest) {
        this.isLoadingUser = true

        try {
            await register(details)
            return await this.signIn({
                email: details.email,
                password: details.password,
                rememberMe: true,
            })
        } finally {
            runInAction(() => {
                this.isLoadingUser = false
                this.hasCheckedAuth = true
            })
        }
    }

    async signOut() {
        try {
            await logout()
        } finally {
            runInAction(() => {
                this.user = null
                this.hasCheckedAuth = true
            })
        }
    }
}

export default AuthStore