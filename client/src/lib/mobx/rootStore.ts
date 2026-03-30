import AuthStore from './authStore'
import UiStore from './uiStore'

class RootStore {
    authStore: AuthStore
    uiStore: UiStore

    constructor() {
        this.authStore = new AuthStore()
        this.uiStore = new UiStore()
    }
}

export default RootStore