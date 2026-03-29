import { makeAutoObservable } from 'mobx'

class UiStore {
    isCreateDrawerOpen = false

    constructor() {
        makeAutoObservable(this)
    }

    openCreateDrawer() {
        this.isCreateDrawerOpen = true
    }

    closeCreateDrawer() {
        this.isCreateDrawerOpen = false
    }

    toggleCreateDrawer() {
        this.isCreateDrawerOpen = !this.isCreateDrawerOpen
    }
}

export default UiStore